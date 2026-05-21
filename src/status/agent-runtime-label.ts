import { isCliProvider } from "../agents/model-selection.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { getActivePluginRegistryVersion } from "../plugins/runtime.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import { sanitizeTerminalText } from "../terminal/safe-text.js";

const AGENT_RUNTIME_LABELS: Readonly<Record<string, string>> = {
  pi: "OpenClaw Pi Default",
  codex: "OpenAI Codex",
  "codex-cli": "OpenAI Codex",
  "claude-cli": "Claude CLI",
  "google-gemini-cli": "Gemini CLI",
};

type CliProviderLabelCacheEntry = {
  registryVersion: number;
  value: boolean;
};

let cliProviderLabelCache = new WeakMap<OpenClawConfig, Map<string, CliProviderLabelCacheEntry>>();
let cliProviderLabelCacheClearScheduled = false;

function scheduleCliProviderLabelCacheClear(): void {
  if (cliProviderLabelCacheClearScheduled) {
    return;
  }
  cliProviderLabelCacheClearScheduled = true;
  queueMicrotask(() => {
    cliProviderLabelCache = new WeakMap();
    cliProviderLabelCacheClearScheduled = false;
  });
}

function isCliProviderForLabel(provider: string, config: OpenClawConfig): boolean {
  const key = normalizeOptionalLowercaseString(provider) ?? provider;
  const registryVersion = getActivePluginRegistryVersion();
  scheduleCliProviderLabelCacheClear();
  let cache = cliProviderLabelCache.get(config);
  if (!cache) {
    cache = new Map();
    cliProviderLabelCache.set(config, cache);
  }
  const cached = cache.get(key);
  if (cached && cached.registryVersion === registryVersion) {
    return cached.value;
  }
  const resolved = isCliProvider(provider, config);
  cache.set(key, {
    registryVersion,
    value: resolved,
  });
  return resolved;
}

export function resolveAgentRuntimeLabel(args: {
  config?: OpenClawConfig;
  sessionEntry?: Pick<
    SessionEntry,
    "acp" | "agentRuntimeOverride" | "agentHarnessId" | "modelProvider" | "providerOverride"
  >;
  resolvedHarness?: string;
  fallbackProvider?: string;
}): string {
  const acpAgentRaw = normalizeOptionalString(args.sessionEntry?.acp?.agent);
  const acpAgent = acpAgentRaw ? sanitizeTerminalText(acpAgentRaw) : undefined;
  if (acpAgent) {
    const backendRaw = normalizeOptionalString(args.sessionEntry?.acp?.backend);
    const backend = backendRaw ? sanitizeTerminalText(backendRaw) : undefined;
    return backend ? `${acpAgent} (acp/${backend})` : `${acpAgent} (acp)`;
  }

  const runtimeRaw = normalizeOptionalString(args.resolvedHarness);
  const runtime = normalizeOptionalLowercaseString(runtimeRaw);
  if (runtime && runtime !== "auto" && runtime !== "default") {
    return AGENT_RUNTIME_LABELS[runtime] ?? sanitizeTerminalText(runtimeRaw ?? runtime);
  }

  const providerRaw =
    normalizeOptionalString(args.sessionEntry?.modelProvider) ??
    normalizeOptionalString(args.sessionEntry?.providerOverride) ??
    normalizeOptionalString(args.fallbackProvider);
  const provider = providerRaw ? sanitizeTerminalText(providerRaw) : undefined;
  const cliProvider =
    provider && args.config
      ? isCliProviderForLabel(provider, args.config)
      : provider
        ? isCliProvider(provider, args.config)
        : false;
  if (provider && cliProvider) {
    return (
      AGENT_RUNTIME_LABELS[normalizeOptionalLowercaseString(providerRaw) ?? ""] ??
      `${provider} (cli)`
    );
  }

  return AGENT_RUNTIME_LABELS.pi;
}
