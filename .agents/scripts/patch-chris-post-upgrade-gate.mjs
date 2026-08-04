#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repo = path.resolve(__dirname, "../..");
const args = new Map();

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) {
    throw new Error(`Unexpected argument: ${arg}`);
  }
  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) {
    args.set(key, "true");
  } else {
    args.set(key, next);
    i += 1;
  }
}

function run(cmd, cmdArgs, options = {}) {
  return execFileSync(cmd, cmdArgs, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runJson(cmd, cmdArgs) {
  const output = run(cmd, cmdArgs);
  return JSON.parse(output);
}

function ok(message) {
  console.log(`OK ${message}`);
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function expect(condition, message) {
  if (condition) {
    ok(message);
  } else {
    fail(message);
  }
}

function localDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const version = String(args.get("version") ?? packageJson.version);
// --tag overrides tag derivation for npm republish tags (e.g. v2026.7.1-2 with package version 2026.7.1).
const rawTag = String(args.get("tag") ?? version);
const tag = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;
const date = String(args.get("date") ?? localDate());
const head = run("git", ["rev-parse", "HEAD"]);
const shortHead = run("git", ["rev-parse", "--short=7", "HEAD"]);
const recordPath = path.join(repo, ".agents/runbooks", `patch-chris-${tag}-record.md`);
const notePath = path.join("/Users/chris/Documents/ChrisData/Agent/main/upgrades", `${date}.md`);
const refsDir = "/Users/chris/.agents/skills/openclaw-local-ops/references";
const refFiles = [
  "config-schema-map.md",
  "docs-route-map.md",
  "local-profile.md",
  "ops-quick-routes.md",
].map((name) => path.join(refsDir, name));

expect(fs.existsSync(recordPath), `runbook record exists: ${path.relative(repo, recordPath)}`);

const noteOk = fs.existsSync(notePath) && fs.readFileSync(notePath, "utf8").includes(tag.slice(1));
expect(noteOk, `Obsidian upgrade note contains ${tag}: ${notePath}`);

const headTimeMs = Number(run("git", ["log", "-1", "--format=%ct"])) * 1000;
const refsFresh = refFiles.every(
  (file) => fs.existsSync(file) && fs.statSync(file).mtimeMs >= headTimeMs,
);
expect(refsFresh, "openclaw-local-ops references refreshed after final HEAD");

const distImport = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", 'await import("./dist/index.js")'],
  { cwd: repo, stdio: "pipe", encoding: "utf8" },
);
expect(distImport.status === 0, "dist/index.js imports");
expect(
  fs.existsSync(path.join(repo, "dist-runtime/extensions/litellm/openclaw.plugin.json")),
  "dist-runtime litellm manifest exists",
);

const cliVersion = run("openclaw", ["--version"]);
expect(cliVersion.includes(version), `CLI reports ${version}`);
expect(cliVersion.includes(shortHead), `CLI reports built commit ${shortHead}`);

const gateway = runJson("openclaw", ["gateway", "status", "--deep", "--require-rpc", "--json"]);
expect(gateway?.cli?.version === version, `gateway status CLI version ${version}`);
expect(gateway?.gateway?.version === version, `gateway version ${version}`);
expect(gateway?.rpc?.version === version, `RPC version ${version}`);
expect(gateway?.service?.runtime?.status === "running", "gateway service running");
expect(gateway?.service?.configAudit?.ok === true, "gateway service config audit OK");
expect(
  Array.isArray(gateway?.pluginVersionDrift?.drifts) &&
    gateway.pluginVersionDrift.drifts.length === 0,
  "plugin version drift empty",
);

const health = runJson("openclaw", ["health", "--json"]);
expect(health?.ok === true, "health OK");
expect(health?.eventLoop?.degraded !== true, "health event loop not degraded");

const channels = runJson("openclaw", [
  "channels",
  "status",
  "--probe",
  "--channel",
  "imessage",
  "--json",
]);
const imessage = channels?.channels?.imessage;
expect(channels?.eventLoop?.degraded !== true, "channels event loop not degraded");
expect(imessage?.configured === true, "iMessage configured");
expect(imessage?.running === true, "iMessage running");
expect(imessage?.probe?.ok === true, "iMessage probe OK");

const originPatch = run("git", ["rev-parse", "origin/patch/chris"]);
expect(head === originPatch, "origin/patch/chris matches HEAD");

const targetCommit = run("git", ["rev-parse", `${tag}^{commit}`]);
const mainCommit = run("git", ["rev-parse", "main"]);
const originMainCommit = run("git", ["rev-parse", "origin/main"]);
expect(mainCommit === targetCommit, `main points at ${tag}`);
expect(originMainCommit === targetCommit, `origin/main points at ${tag}`);

if (process.exitCode) {
  console.error("Post-upgrade gate failed.");
  process.exit(process.exitCode);
}

console.log(`Post-upgrade gate passed for ${tag}.`);
