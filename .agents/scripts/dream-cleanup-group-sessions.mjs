#!/usr/bin/env node
/**
 * Dream pollution cleanup for excluded group sessions.
 *
 * Companion to the `plugins.entries.memory-core.config.dreaming.excludeGroupIds`
 * filter. The filter only stops FUTURE ingestion — this script scrubs the
 * accumulated traces left behind by past dreaming sweeps.
 *
 * Layers cleaned (per agent workspace):
 *   1. session-ingestion.json (files map + seenMessages map)
 *   2. session-corpus/<date>.txt (per-line filter)
 *
 * Layers NOT cleaned (provenance unrecoverable from group id alone):
 *   - short-term-recall.json   (entries reference memory artifacts, not transcripts)
 *   - DREAMS.md                (markdown narrative, no reversible scrub)
 *   - <agent>.sqlite chunks    (source="memory", path=memory/*.md)
 *   - lancedb                  (legacy, last modified Mar 30)
 *
 * Usage:
 *   node .agents/scripts/dream-cleanup-group-sessions.mjs \
 *     --group-ids "-1003787571927,oc_a2a01ae2049917a984851cab73213b88" \
 *     [--apply]                  # default dry-run
 *     [--openclaw-home <path>]   # default ~/.openclaw
 *     [--agents main,ivy,...]    # default all 5
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);

function parseArg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return args[i + 1];
}

const DEFAULT_AGENTS = ["main", "ivy", "filomail", "social", "email"];
const APPLY = args.includes("--apply");
const HOME = parseArg("--openclaw-home", path.join(os.homedir(), ".openclaw"));
const GROUP_IDS_RAW = parseArg("--group-ids", "");
const AGENTS_RAW = parseArg("--agents", DEFAULT_AGENTS.join(","));

if (!GROUP_IDS_RAW) {
  console.error("error: --group-ids is required (comma-separated)");
  process.exit(2);
}

const GROUP_IDS = GROUP_IDS_RAW.split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const AGENTS = AGENTS_RAW.split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`mode:        ${APPLY ? "APPLY" : "dry-run"}`);
console.log(`openclaw:    ${HOME}`);
console.log(`agents:      ${AGENTS.join(", ")}`);
console.log(`group ids:   ${GROUP_IDS.join(", ")}`);
console.log("");

/**
 * Mirrors `isExcludedGroupSessionKey` from src/memory-host-sdk/dreaming.ts.
 * Kept inline so the script has no build/import dependency on the repo.
 */
function isExcludedGroupSessionKey(sessionKey, excludeGroupIds) {
  if (!sessionKey || excludeGroupIds.length === 0) return false;
  for (const groupId of excludeGroupIds) {
    if (!groupId) continue;
    const marker = `:group:${groupId}`;
    const idx = sessionKey.indexOf(marker);
    if (idx < 0) continue;
    const after = sessionKey.charAt(idx + marker.length);
    if (after === "" || after === ":") return true;
  }
  return false;
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(filePath, data) {
  if (!APPLY) return;
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function extractTranscriptUuids(sessionsJsonObj) {
  // For each key matching an excluded group, return its sessionFile basename
  // (used to match against session-ingestion + corpus lines).
  const uuids = new Set();
  for (const [sessionKey, entry] of Object.entries(sessionsJsonObj)) {
    if (!isExcludedGroupSessionKey(sessionKey, GROUP_IDS)) continue;
    const sessionFile = entry && typeof entry.sessionFile === "string" ? entry.sessionFile : null;
    if (sessionFile) {
      uuids.add(path.basename(sessionFile));
      // also without extension for corpus marker matches
      const stem = path.basename(sessionFile, ".jsonl");
      if (stem !== sessionFile) uuids.add(stem);
    }
    const sessionId = entry && typeof entry.sessionId === "string" ? entry.sessionId.trim() : null;
    if (sessionId) {
      uuids.add(`${sessionId}.jsonl`);
      uuids.add(sessionId);
    }
  }
  return uuids;
}

function isUuidMatchInString(s, uuids) {
  for (const u of uuids) {
    if (s.includes(u)) return true;
  }
  return false;
}

// ── Layer 1: session-ingestion.json ──
async function cleanSessionIngestion(workspaceDir, transcriptUuids) {
  const filePath = path.join(workspaceDir, "memory/.dreams/session-ingestion.json");
  const data = await readJson(filePath);
  if (!data || typeof data !== "object") {
    return { exists: false, filesRemoved: 0, seenRemoved: 0 };
  }
  let filesRemoved = 0;
  let seenRemoved = 0;
  if (data.files && typeof data.files === "object") {
    const next = {};
    for (const [key, value] of Object.entries(data.files)) {
      if (isUuidMatchInString(key, transcriptUuids)) {
        filesRemoved++;
      } else {
        next[key] = value;
      }
    }
    if (filesRemoved > 0) data.files = next;
  }
  if (data.seenMessages && typeof data.seenMessages === "object") {
    const next = {};
    for (const [key, value] of Object.entries(data.seenMessages)) {
      if (isUuidMatchInString(key, transcriptUuids)) {
        seenRemoved++;
      } else {
        next[key] = value;
      }
    }
    if (seenRemoved > 0) data.seenMessages = next;
  }
  if ((filesRemoved > 0 || seenRemoved > 0) && APPLY) {
    await writeJson(filePath, data);
  }
  return { exists: true, filesRemoved, seenRemoved };
}

// ── Layer 3: session-corpus/<date>.txt ──
async function cleanSessionCorpus(workspaceDir, transcriptUuids) {
  const corpusDir = path.join(workspaceDir, "memory/.dreams/session-corpus");
  let entries;
  try {
    entries = await fs.readdir(corpusDir);
  } catch {
    return { totalLinesRemoved: 0, filesAffected: 0 };
  }
  let totalLinesRemoved = 0;
  let filesAffected = 0;
  for (const name of entries) {
    if (!name.endsWith(".txt")) continue;
    const fpath = path.join(corpusDir, name);
    let raw;
    try {
      raw = await fs.readFile(fpath, "utf-8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    const kept = lines.filter((line) => !isUuidMatchInString(line, transcriptUuids));
    const removed = lines.length - kept.length;
    if (removed > 0) {
      totalLinesRemoved += removed;
      filesAffected++;
      if (APPLY) {
        await fs.writeFile(fpath, kept.join("\n"), "utf-8");
      }
    }
  }
  return { totalLinesRemoved, filesAffected };
}

async function processAgent(agentId) {
  const sessionsDir = path.join(HOME, "agents", agentId, "sessions");
  const sessionsJsonPath = path.join(sessionsDir, "sessions.json");
  const sessionsJson = await readJson(sessionsJsonPath);
  if (!sessionsJson) {
    return null;
  }
  const transcriptUuids = extractTranscriptUuids(sessionsJson);
  if (transcriptUuids.size === 0) {
    return { agentId, matchedSessions: 0 };
  }

  // Find the workspace dir for this agent. Convention: workspace for "main"
  // is ~/.openclaw/workspace (no suffix); others are workspace-<agentId>.
  const wsCandidates =
    agentId === "main" ? [path.join(HOME, "workspace")] : [path.join(HOME, `workspace-${agentId}`)];

  const result = {
    agentId,
    matchedSessions: 0,
    transcriptUuids: [...transcriptUuids],
    workspaces: [],
  };
  for (const [key, value] of Object.entries(sessionsJson)) {
    if (isExcludedGroupSessionKey(key, GROUP_IDS)) result.matchedSessions++;
  }
  for (const ws of wsCandidates) {
    try {
      await fs.stat(ws);
    } catch {
      continue;
    }
    const ingest = await cleanSessionIngestion(ws, transcriptUuids);
    const corpus = await cleanSessionCorpus(ws, transcriptUuids);
    result.workspaces.push({ workspaceDir: ws, ingest, corpus });
  }
  return result;
}

let totalSessions = 0;
let totalFilesRemoved = 0;
let totalSeenRemoved = 0;
let totalCorpusLinesRemoved = 0;

for (const agentId of AGENTS) {
  const res = await processAgent(agentId);
  if (!res) {
    console.log(`--- ${agentId}: no sessions.json, skipped ---\n`);
    continue;
  }
  console.log(`--- ${agentId} ---`);
  console.log(`  matched group sessions: ${res.matchedSessions}`);
  if (res.transcriptUuids && res.transcriptUuids.length > 0) {
    console.log(`  transcript uuids (${res.transcriptUuids.length}):`);
    for (const u of res.transcriptUuids) console.log(`    ${u}`);
  }
  totalSessions += res.matchedSessions;
  for (const ws of res.workspaces ?? []) {
    console.log(`  workspace: ${ws.workspaceDir}`);
    console.log(
      `    session-ingestion.files removed: ${ws.ingest.filesRemoved}, seenMessages removed: ${ws.ingest.seenRemoved}`,
    );
    console.log(
      `    session-corpus lines removed: ${ws.corpus.totalLinesRemoved} (across ${ws.corpus.filesAffected} files)`,
    );
    totalFilesRemoved += ws.ingest.filesRemoved;
    totalSeenRemoved += ws.ingest.seenRemoved;
    totalCorpusLinesRemoved += ws.corpus.totalLinesRemoved;
  }
  console.log("");
}

console.log("=== summary ===");
console.log(`matched group sessions:           ${totalSessions}`);
console.log(`session-ingestion.files removed:  ${totalFilesRemoved}`);
console.log(`session-ingestion.seen removed:   ${totalSeenRemoved}`);
console.log(`session-corpus lines removed:     ${totalCorpusLinesRemoved}`);
console.log(`mode:                             ${APPLY ? "APPLIED" : "dry-run (no writes)"}`);
if (!APPLY) {
  console.log("");
  console.log("Re-run with --apply to write the changes.");
}
