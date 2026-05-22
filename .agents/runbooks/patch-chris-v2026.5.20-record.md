# patch/chris v2026.5.20 update record

Date: 2026-05-22.

Purpose: upgrade `patch/chris` from `v2026.5.19` to the latest formal release
tag `v2026.5.20`, and use the same maintenance window to compact the local
patch stack from 22 commits down to 14 by dropping cosmetic / superseded
patches and squashing pre-rebase iterative work.

`v2026.5.20-beta.1` / `v2026.5.20-beta.2` / `v2026.5.21-alpha.1` existed
locally after the tag fetch and were intentionally not used.

## Source and target

- Installed/runtime version before this maintenance window: `OpenClaw 2026.5.19`.
- Source tag: `v2026.5.19` (`a185ca283a74092d3840d0c81c53cf02e25024e8`).
- Target formal tag: `v2026.5.20` (`e510042870cf248c0e0461b6f8d427326266141d`).
- Official tag object: `8934a3c7ee22fe1a3348e6fc91058b1d4702eea7`.
- Backup tag: `patch/chris-pre-rework-20260522`
  (`0f60f8368a9c26c3ea8ecd5f6075458b42d8c2f8`) — points at the original
  22-commit `patch/chris` HEAD before this round's rework.
- Local `main` and `origin/main` were moved to `v2026.5.20^{}`.
- Fork tag `origin/v2026.5.20` was created.
- Post-port head: `72bcd9a7bb0082eaa09a6afffbb330ffd744c0f3`.

`v2026.5.20` is not a linear descendant of `v2026.5.19`; the merge-base sits
back at `5c39e0019d` (`v2026.4.19-beta.2`-era). Upstream cuts release tags
from a separate release branch that is not tracked by `upstream/main`. As in
the previous round, this means `git rebase main` would pick the wrong base
(reflog / fork-point would include old release-prep commits). The actual
rebase was done with an explicit base: `git rebase --onto main v2026.5.19
patch/chris`.

## Backup

- The reworked `patch/chris-rework` branch was built first; the original
  22-commit `patch/chris` HEAD was preserved with the
  `patch/chris-pre-rework-20260522` tag. After verification the rework branch
  was renamed onto `patch/chris` (`git branch -M patch/chris-rework patch/chris`).
- No manual `pnpm openclaw backup` snapshot was taken this round; the daily
  04:00 cron backup at `zqchris/openclaw-backup` provides the same coverage
  and the work was purely git/repo-side (no `~/.openclaw` mutation until
  gateway restart).
- Pre-rework HEAD recoverable via:
  `git reset --hard patch/chris-pre-rework-20260522`.

## Patch audit and rework

The 22-commit `patch/chris` was inspected commit-by-commit against
`v2026.5.20`. Results:

### Dropped local commits (6)

| Old SHA      | Title                                                           | Reason                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `53b44d05ee` | fix(memory-core): exclude stable cron sessions from dreaming    | Bundled two features. Cron-session exclusion: upstream `v2026.5.20` implements `cronRunTranscriptPaths` via #70464. **`excludeAgents` half is not in upstream — partial-restored as a fresh commit (`72bcd9a7bb`) so the email agent's Gmail-hook sessions stay out of dreaming workspace fan-out.** |
| `f938448a37` | fix(auth-profiles): mask emails in /status display labels       | Cosmetic privacy patch for `/status` output. Only visible in local CLI usage; the email is already public in `git config`. Not justified.                                                                                                                                                            |
| `8638a67cb7` | fix(telegram): drop monospace wrap from tool progress bubble    | Cosmetic style change for Telegram tool-progress bubble. Functional behavior unchanged.                                                                                                                                                                                                              |
| `67b193eb9e` | test(telegram): align progress draft no-monospace expectation   | Paired test for `8638a67cb7`; dropped together.                                                                                                                                                                                                                                                      |
| `0f60f8368a` | fix(status): cache runtime label cli checks                     | Performance cache for `pnpm openclaw status`. Marginal benefit; overlaps with upstream `f39f56a096 perf(cli): cache stable subcommand help` in the same area and would have raised rebase friction without offsetting value.                                                                         |
| `3145fd92ad` | fix(feishu): list accepted parameter aliases in tool error msgs | Diagnostic UX improvement after the "product-feedback room" incident. 0 occurrences of the original error pattern in `~/.openclaw/logs/gateway.log` over the past ~3 weeks — incident did not recur, agents now use canonical param names.                                                           |

### Squashed local commits (5 → 2)

| Original SHAs                              | Squashed commit                                                            | Notes                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a33cf2f418` + `2d670653f0`                | `d745661b89` fix(feishu): preserve topic reply anchors                     | `2d670653f0` was a 4-line post-rebase complement to `a33cf2f418`'s original anchor work (wires `currentThreadTs` from `toolContext` into `resolveFeishuTopicAutoThreadAnchor`). Pair only makes sense as one logical fix.                                                                                                  |
| `50f65eebaf` + `e6387be528` + `2a8dea2062` | `d7eb9586bf` fix(feishu): pull attachments from quoted/root/thread history | `e6387be528`'s own commit msg states it should have been part of `50f65eebaf` (test file missed during initial staging). `2a8dea2062` was a v5.19 rebase fixup that renamed a test export. Squashed message includes the known-gap notes for visibility-filter, pre-mention thread history, and rich-text embedded images. |

### Reworked local commit (1)

| Old SHA      | New SHA      | Title                                                                                     | Change                                                                                                                                                                                                                                                                                                                   |
| ------------ | ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `416d0cbac0` | `b9fc05a3e3` | fix(ssrf): honor allowPrivateNetwork for loopback hostnames + keep cloud metadata blocked | Removed BlueBubbles references from commit message and two in-code comments (BB was removed upstream in v2026.5.12). The 74-line code/test logic is unchanged — the rework is documentation only. Replaced "BlueBubbles Private API" example with "local LLM proxies on localhost (LMStudio, Ollama, ComfyUI, LiteLLM)". |

### Added local commit (1)

| New SHA      | Title                                                            | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `72bcd9a7bb` | fix(memory-core): exclude configured agents from dreaming sweeps | Partial-restore of the `excludeAgents` half of dropped `53b44d05ee`. Verified that `v2026.5.20`'s `cronRunTranscriptPaths` filter only matches `cron:<jobId>:run:<runId>` session keys, while the email agent's hot path (`agent:email:hook:gmail:triage`) does NOT match. Without the patch, Gmail inbound traffic would flow into dreaming corpus — exactly the failure mode that motivated the original `excludeAgents` design (marketing emails read as personal interests, etc.). |

### Kept local commits (no change)

In topological order on the rebased branch:

- `011218fd58` fix(agents): respect caller-supplied model in live session switch check (was `e7952cdb7f`)
- `a509463b30` fix(silent-reply): classify thread sessionKeys correctly (was `f5c5513aa2`)
- `ee04bb66a4` docs(runbook): add patch/chris upstream runbook + 5.12 update record (was `442a7286fb`)
- `631585dd24` docs(runbook): record v2026.5.16-beta.4 emergency upgrade (was `9d7268878d`)
- `3eb3c34d28` docs(runbook): document acpx disabled state (was `dac03baf89`)
- `19555efd00` docs(runbook): record v2026.5.18 update (was `6aba63cd93`)
- `7902a21523` fix(telegram): recover failed final delivery (was `6ffbc11853`)
- `13d9af97cc` fix(imessage): recover malformed chat zero payloads (was `b2cf462696`)
- `1195320200` test(imessage): type repair RPC mock (was `fbc610e803`)
- `9c5049a292` docs(runbook): record v2026.5.19 update (was `8ba2519275`)

### Auto-dropped (release prep)

- `430f868cb6` chore(release): prepare 2026.5.19 beta 1
- `947a07016e` chore(release): prepare 2026.5.19 beta 2
- `b14ae2fbea` chore(release): prepare 2026.5.19 stable

These release-prep commits exist only on the 5.19 release branch line and are
not on the 5.20 line; the explicit-base rebase replays only Chris's own work,
so these never re-enter `patch/chris`.

## Final commit chain on `v2026.5.20`

```
72bcd9a7bb fix(memory-core): exclude configured agents from dreaming sweeps
9c5049a292 docs(runbook): record v2026.5.19 update
1195320200 test(imessage): type repair RPC mock
13d9af97cc fix(imessage): recover malformed chat zero payloads
7902a21523 fix(telegram): recover failed final delivery
19555efd00 docs(runbook): record v2026.5.18 update
3eb3c34d28 docs(runbook): document acpx disabled state
631585dd24 docs(runbook): record v2026.5.16-beta.4 emergency upgrade
ee04bb66a4 docs(runbook): add patch/chris upstream runbook + 5.12 update record
d7eb9586bf fix(feishu): pull attachments from quoted/root/thread history
d745661b89 fix(feishu): preserve topic reply anchors
a509463b30 fix(silent-reply): classify thread sessionKeys correctly
b9fc05a3e3 fix(ssrf): honor allowPrivateNetwork for loopback hostnames + keep cloud metadata blocked
011218fd58 fix(agents): respect caller-supplied model in live session switch check
```

14 commits, 47 files changed, +3182 / -155 vs `v2026.5.20`.

## Conflict resolutions

The explicit-base rebase (`git rebase --onto main v2026.5.19 patch/chris`)
replayed all 13 commits (the new `excludeAgents` commit was added after the
rebase) without a single conflict. Notably:

- SSRF: `v2026.5.20` includes upstream PR #80751 restructure (allowedOrigins,
  hostnameAllowlist, `shouldSkipPrivateNetworkChecks`, `resolveSsrFPolicyForUrl`)
  that the original local patch's commit message warned about. The local
  patch operates on lines that the upstream refactor did not touch — clean
  replay.
- Feishu attachment resolver and thread anchor changes applied without
  collision; upstream `v2026.5.20` did not touch the surrounding lines.
- iMessage conversation repair and Telegram outbound recovery touched only
  new files / isolated lines.

## Validation

Build + tests + gates, all before gateway restart:

- `trash dist dist-runtime && pnpm install --frozen-lockfile && pnpm build`:
  passed (both pre-rebase and post-rebase builds; second build done after the
  `excludeAgents` restore commit).
- `dist-runtime/extensions/litellm/openclaw.plugin.json`: present.
- `node --input-type=module -e 'await import("./dist/index.js")'`: passed.
- `pnpm openclaw config validate`: `Config valid` (the existing
  `plugins.entries.memory-core.config.dreaming.excludeAgents: ["email"]`
  again validates against the schema thanks to the partial restore).
- `pnpm check:changed --base main`: passed (lint, runtime sidecar loader
  guard, import cycles, media download helper guard, webhook auth body
  guard, pairing store / account guards).
- Targeted vitest:
  - `src/agents/live-model-switch.test.ts`,
    `src/infra/net/ssrf.test.ts`,
    `src/shared/silent-reply-policy.test.ts`: 63 unit-fast + 20 agents shard tests passed.
  - `extensions/feishu/src/{bot,channel,reactions,outbound,send,bot-content.referenced-media}.test.ts`:
    202 tests passed.
  - `extensions/telegram/src/outbound-recovery.test.ts`,
    `extensions/imessage/src/monitor/conversation-repair.test.ts`: 6 tests passed.
  - `src/memory-host-sdk/dreaming.test.ts` (with the new `excludeAgents`
    case): 15 tests passed.

## Runtime rollout

- Gateway restart performed: `launchctl bootout gui/$(id -u)/ai.openclaw.gateway`
  then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist`.
  First `bootstrap` returned exit 5 (IO error) due to `ThrottleInterval=10` on
  the plist; second attempt within a few seconds succeeded cleanly.
- Post-restart verification at `2026-05-22T11:43:52+08:00`:
  - `pnpm openclaw --version`: `OpenClaw 2026.5.20 (72bcd9a)`.
  - `launchctl print gui/$(id -u)/ai.openclaw.gateway`: state=running.
  - `[gateway] ready` 4 seconds after start.
  - Channel probes `ok: true` for imessage, feishu (葫芦), telegram (@zkyo_bot).
  - 0 `LiveSessionModelSwitchError` since restart (the e7952cdb7f / 011218fd58
    fix continues to work; previous evidence of pre-patch occurrences on
    2026-03-29 is unchanged).
  - 0 ERR\_/FATAL/UnhandledRejection/TypeError/ReferenceError in
    `~/Library/Logs/openclaw/gateway.log` since 11:43:52. One earlier
    `ERR_MODULE_NOT_FOUND` at 11:27 was the running-old-gateway hitting the
    newly-rebuilt dist mid-build; resolved by the restart.
  - `delivery-recovery` (Telegram, `7902a21523`) initialized cleanly:
    `Found 3 pending delivery entries — starting recovery`.
- Doctor warnings (read-only `pnpm openclaw doctor`):
  - New in v2026.5.20: plaintext-secret detection flags
    `messages.tts.providers.elevenlabs.apiKey`,
    `plugins.entries.brave.config.webSearch.apiKey`,
    `channels.feishu.accounts.default.appSecret`. **Not addressed in this
    upgrade**; migration to `openclaw secrets configure` can be done out of
    band. Do not run `openclaw doctor --fix` on this machine.
  - Existing: gateway bound to lan (0.0.0.0). Same as before.

## Post-upgrade incident: iMessage outbound silently failing

After the v2026.5.20 upgrade landed, iMessage agent replies stopped being
delivered. Root cause and fix took ~90 min to land properly and pulled in
one new patch.

### Symptom timeline

- 2026-05-20 22:14: last successful `[imessage] delivered reply`.
- 2026-05-21 morning: 6 imessage provider auto-restarts in 75 min (09:06
  through 11:06). Single successful `delivered reply` at 19:34, then
  silence.
- 2026-05-22 04:22: 吴悠洋 sent "你要不以后取消这个微博热搜吧" via
  iMessage. social agent session `9d034cb9-…f17b64a` received it, ran
  cron tools, produced final assistant text "好，我把 22:00 的「微博热搜
  总结」关掉了。以后不再往群里发这个。" at 04:27:10 — **never
  delivered**. Subsequent sessions (`705a1364-…4252777` at 09:13)
  recorded the explicit error `{"status":"error","tool":"message",
"error":"imsg rpc timeout (send)"}`.
- 2026-05-22 12:51: full root cause identified and fixed; outbound
  restored.

### Root cause

`imsg-bridge-helper.dylib` injection into Messages.app had been lost.
The bridge stayed registered as `bridge version: v0` (degraded stub)
which accepts handshakes and answers `imsg status` but silently fails
every actual RPC (`send-message`, `get-account-info`, `tapback`,
`check-imessage-availability` all time out at 10 s). The AppleScript
fallback path that `imsg` would normally take also failed because
Messages.app stopped responding to AppleEvents (`AppleEvent timed out
-1712` at 120 s).

The dylib was almost certainly lost when Messages.app was force-
relaunched by macOS at some point on 2026-05-21 morning; `imsg launch`
sets `DYLD_INSERT_LIBRARIES` only on the process it launches itself,
and a plain `open -a Messages` (or system-driven relaunch) replaces
the process without re-injection. The bridge handshake degraded to v0
and stayed that way until `imsg launch` was re-run.

### Fix path attempted (for the record — what did and didn't work)

| Step                                                                  | Outcome                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple gateway bootout/bootstrap                                    | No effect — kept reconnecting to the same broken bridge.                                                                                                                                                                                                                     |
| `brew upgrade imsg` 0.8.1 → 0.9.0 (after `brew unpin imsg`)           | **Backfire**: 0.9.0 enters auto-restart loop on macOS 26 (upstream issue [openclaw/imsg#117](https://github.com/openclaw/imsg/issues/117) "imsg launch timeout"). 7 orphan `imsg rpc` processes piled on mini. Rolled back to 0.8.1 from local `~/imsg-rollback-0.8.1` copy. |
| `pkill Messages.app && open -a Messages`                              | No effect — relaunched without dylib injection, bridge still v0.                                                                                                                                                                                                             |
| `kill imagent` (PID 787, 45 days uptime)                              | No effect — daemon was fine.                                                                                                                                                                                                                                                 |
| **`imsg-mini-ssh-wrapper launch`** (re-runs `imsg launch` end-to-end) | **Fix**: kills Messages.app, relaunches with `DYLD_INSERT_LIBRARIES=imsg-bridge-helper.dylib`. Bridge upgrades from `v0` → `v2 (v2 inbox active)`. `send-rich` returns in 0.45 s. `tapback` returns in 0.7 s.                                                                |

### Hardening patch (commit `88e590ff53`)

`fix(imessage): default imsg send transport to "auto" instead of
legacy AppleScript`. Even with the bridge live, openclaw's
`extensions/imessage/src/send.ts` was calling the JSON-RPC `send`
method without the `transport` parameter, leaving `imsg` to fall back
to its legacy default — AppleScript on the Messages.app event loop.
Tracks upstream [openclaw/openclaw#84329](https://github.com/openclaw/openclaw/issues/84329).

- `src/config/types.imessage.ts`: add `transport?: "auto" | "bridge" |
"applescript"` field on `IMessageAccountConfig`.
- `src/config/zod-schema.providers-core.ts`: validate the enum.
- `extensions/imessage/src/send.ts`: read transport from opts/account/
  default and include it in the JSON-RPC `send` params.
- `extensions/imessage/src/send.test.ts`: cover default + per-account
  override.
- `src/config/bundled-channel-config-metadata.generated.ts` and
  `docs/.generated/config-baseline.sha256` regenerated to pick up the
  schema addition (otherwise `pnpm openclaw config set
channels.imessage.accounts.default.transport bridge` rejects the new
  key as "additional property not allowed").

Set `channels.imessage.accounts.default.transport = "bridge"` in
`~/.openclaw/openclaw.json` so this machine never silently falls back
to AppleScript again — `"bridge"` fails fast if the dylib is missing,
which surfaces the problem instead of hiding it for 30 s of RPC
timeout.

### Follow-up TODO (not done)

- Write a launchd watcher that re-runs `imsg launch` whenever a fresh
  `Messages.app` process appears without the bridge dylib injected.
  Chris explicitly deferred this — accepted the manual `imsg launch`
  step in exchange for not adding more system surface area.
- File a tracking note on `openclaw/openclaw#84329` summarising the
  reproduction evidence collected here (AppleEvent -1712 timeout in
  120 s, bridge v0 vs v2 distinction, fix via `transport: "bridge"`).
- File a tracking note on `openclaw/imsg#117` confirming the same
  bridge-attach failure mode happens on macOS 26.3 (build 25D125) and
  not only 26.5.

## Runtime rollout

- Gateway restart performed: `launchctl bootout gui/$(id -u)/ai.openclaw.gateway`
  then `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist`.
  First `bootstrap` returned exit 5 (IO error) due to `ThrottleInterval=10` on
  the plist; second attempt within a few seconds succeeded cleanly.
- Post-restart verification at `2026-05-22T11:43:52+08:00`:
  - `pnpm openclaw --version`: `OpenClaw 2026.5.20 (72bcd9a)`.
  - `launchctl print gui/$(id -u)/ai.openclaw.gateway`: state=running.
  - `[gateway] ready` 4 seconds after start.
  - Channel probes `ok: true` for imessage, feishu (葫芦), telegram (@zkyo_bot).
  - 0 `LiveSessionModelSwitchError` since restart (the e7952cdb7f / 011218fd58
    fix continues to work; previous evidence of pre-patch occurrences on
    2026-03-29 is unchanged).
  - 0 ERR\_/FATAL/UnhandledRejection/TypeError/ReferenceError in
    `~/Library/Logs/openclaw/gateway.log` since 11:43:52. One earlier
    `ERR_MODULE_NOT_FOUND` at 11:27 was the running-old-gateway hitting the
    newly-rebuilt dist mid-build; resolved by the restart.
  - `delivery-recovery` (Telegram, `7902a21523`) initialized cleanly:
    `Found 3 pending delivery entries — starting recovery`.
- Doctor warnings (read-only `pnpm openclaw doctor`):
  - New in v2026.5.20: plaintext-secret detection flags
    `messages.tts.providers.elevenlabs.apiKey`,
    `plugins.entries.brave.config.webSearch.apiKey`,
    `channels.feishu.accounts.default.appSecret`. **Not addressed in this
    upgrade**; migration to `openclaw secrets configure` can be done out of
    band. Do not run `openclaw doctor --fix` on this machine.
  - Existing: gateway bound to lan (0.0.0.0). Same as before.
- The transport=bridge config change (commit `88e590ff53`) requires a
  **second** gateway restart to load the new dist; pending Chris's
  decision on timing.

## Notes / follow-ups

- The Feishu attachment resolver (`d7eb9586bf`) still has the three known
  gaps recorded in its commit message: visibility filter loses attachments
  from senders outside `contextVisibility`, thread history API may not
  return pre-mention messages, rich-text post-type content's embedded
  images are not picked up by `parseFeishuMediaKeys`. Chris has confirmed
  these matter in the product-feedback group scenario; future work.
- `excludeAgents` is currently used only for `email` (Gmail triage agent).
  Add other agents that handle large reactive inbound traffic if they show
  up in dreaming corpus pollution.
- BlueBubbles references have been fully purged from the local patch surface.
  The SSRF patch is now framed for "local LLM proxies / mDNS LAN services"
  and is a cleaner upstream PR candidate.
- **imsg bridge dylib must be re-injected via `imsg launch` after any
  Messages.app restart** — the macOS `DYLD_INSERT_LIBRARIES`
  injection does not survive a plain relaunch. The post-relaunch state
  is silently degraded (`bridge version: v0`), not failed. Look here
  first if iMessage outbound stops working without obvious cause.
