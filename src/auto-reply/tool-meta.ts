import { formatToolSummary, resolveToolDisplay } from "../agents/tool-display.js";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import { shortenHomeInString, shortenHomePath } from "../utils.js";

type ToolAggregateOptions = {
  markdown?: boolean;
};

export function shortenPath(p: string): string {
  return shortenHomePath(p);
}

export function shortenMeta(meta: string): string {
  if (!meta) {
    return meta;
  }
  return shortenHomeInString(meta);
}

export function formatToolAggregate(
  toolName?: string,
  metas?: string[],
  options?: ToolAggregateOptions,
): string {
  const filtered = (metas ?? []).filter(Boolean).map(shortenMeta);
  const display = resolveToolDisplay({ name: toolName });
  const normalizedToolName = normalizeLowercaseStringOrEmpty(toolName);
  const compactCommandSummary =
    filtered.length > 0 && (normalizedToolName === "exec" || normalizedToolName === "bash");
  const prefix = compactCommandSummary ? display.emoji : `${display.emoji} ${display.label}`;
  if (!filtered.length) {
    return `${display.emoji} ${display.label}`;
  }
  // Dedupe upfront — repeated metas (e.g. agent calling memory_search with the
  // same query twice) carry no extra signal and just eat the line budget.
  const deduped = Array.from(new Set(filtered));

  const rawSegments: string[] = [];
  // Group by directory and brace-collapse filenames
  const grouped: Record<string, string[]> = {};
  for (const m of deduped) {
    if (!isPathLike(m)) {
      rawSegments.push(m);
      continue;
    }
    if (m.includes("→")) {
      rawSegments.push(m);
      continue;
    }
    const parts = m.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      const base = parts.at(-1) ?? m;
      if (!grouped[dir]) {
        grouped[dir] = [];
      }
      grouped[dir].push(base);
    } else {
      if (!grouped["."]) {
        grouped["."] = [];
      }
      grouped["."].push(m);
    }
  }

  const pathSegments = Object.entries(grouped).map(([dir, files]) => {
    const uniqueFiles = Array.from(new Set(files));
    const brace = uniqueFiles.length > 1 ? `{${uniqueFiles.join(", ")}}` : uniqueFiles[0];
    if (dir === ".") {
      return brace;
    }
    return `${dir}/${brace}`;
  });

  const rawCollapsed = collapseByCommonAffix(rawSegments);
  const allSegments = rawCollapsed ? [rawCollapsed, ...pathSegments] : pathSegments;
  const meta = allSegments.join("; ");
  const formattedMeta = formatMetaForDisplay(toolName, meta, options?.markdown);
  return compactCommandSummary ? `${prefix} ${formattedMeta}` : `${prefix}: ${formattedMeta}`;
}

// Brace-collapse 2+ non-path metas via the longest shared prefix/suffix:
// `cmd1, cmd2, cmd3` → `cmd{1, 2, 3}`, `git diff foo.ts, git diff bar.ts` →
// `git diff {foo, bar}.ts`. Falls back to `;`-join when affixes save < 2
// chars or one meta is a strict affix-of-another (which would produce an
// ambiguous `{a, , b}` brace).
function collapseByCommonAffix(metas: string[]): string | undefined {
  if (metas.length === 0) return undefined;
  if (metas.length === 1) return metas[0];

  let prefix = "";
  for (let i = 0; i < metas[0].length; i++) {
    const ch = metas[0][i];
    if (metas.every((s) => s[i] === ch)) {
      prefix += ch;
    } else {
      break;
    }
  }

  let suffix = "";
  const maxSuffixLen = Math.min(...metas.map((s) => s.length - prefix.length));
  for (let i = 1; i <= maxSuffixLen; i++) {
    const ch = metas[0][metas[0].length - i];
    if (metas.every((s) => s[s.length - i] === ch)) {
      suffix = ch + suffix;
    } else {
      break;
    }
  }

  if (prefix.length + suffix.length < 2) {
    return metas.join("; ");
  }

  const middles = metas.map((s) => s.slice(prefix.length, s.length - suffix.length));
  if (middles.some((m) => !m)) {
    return metas.join("; ");
  }
  return `${prefix}{${middles.join(", ")}}${suffix}`;
}

export function formatToolPrefix(toolName?: string, meta?: string) {
  const extra = meta?.trim() ? shortenMeta(meta) : undefined;
  const display = resolveToolDisplay({ name: toolName, meta: extra });
  return formatToolSummary(display);
}

function formatMetaForDisplay(
  toolName: string | undefined,
  meta: string,
  markdown?: boolean,
): string {
  const normalized = normalizeLowercaseStringOrEmpty(toolName);
  if (normalized === "exec" || normalized === "bash") {
    const { flags, body } = splitExecFlags(meta);
    if (flags.length > 0) {
      if (!body) {
        return flags.join(" · ");
      }
      return `${flags.join(" · ")} · ${maybeWrapMarkdown(body, markdown)}`;
    }
  }
  return maybeWrapMarkdown(meta, markdown);
}

function splitExecFlags(meta: string): { flags: string[]; body: string } {
  const parts = meta
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { flags: [], body: "" };
  }
  const flags: string[] = [];
  const bodyParts: string[] = [];
  for (const part of parts) {
    if (part === "elevated" || part === "pty") {
      flags.push(part);
      continue;
    }
    bodyParts.push(part);
  }
  return { flags, body: bodyParts.join(" · ") };
}

function isPathLike(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.includes(" ")) {
    return false;
  }
  if (value.includes("://")) {
    return false;
  }
  if (value.includes("·")) {
    return false;
  }
  if (value.includes("&&") || value.includes("||")) {
    return false;
  }
  return /^~?(\/[^\s]+)+$/.test(value);
}

function maybeWrapMarkdown(value: string, markdown?: boolean): string {
  if (!markdown) {
    return value;
  }
  const delimiter = "`".repeat(longestBacktickRun(value) + 1);
  const padding = value.startsWith("`") || value.endsWith("`") || value.includes("\n") ? " " : "";
  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  let current = 0;
  for (const char of value) {
    if (char === "`") {
      current += 1;
      longest = Math.max(longest, current);
      continue;
    }
    current = 0;
  }
  return longest;
}
