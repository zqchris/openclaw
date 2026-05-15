# patch/chris v2026.5.12 update record

Date: 2026-05-15.

Purpose: tracked post-rebase record for moving `patch/chris` from the `v2026.5.7` base to `v2026.5.12`, including the iMessage cutover work that replaced the old BlueBubbles runtime path.

## Source and target

- Source tag: `v2026.5.7` (`3ac7453873dbc53f7892e48736c8fd28b3ea6f9c`).
- Target tag: `v2026.5.12` (`0358f3dda46dc17d3263e403f6ca895c4d0f749c`).
- Backup tag: `rebase-backup/patch-chris-pre-v2026.5.12-20260515-171144` (`bc2d65d53d1ed5a8ae7084ae221d1cf64271e3c3`).
- Final pushed head: `8585a3a3c2e47a3b2fda7af05dc62c8e98747ef5` (`fix(runtime): finish imessage cutover rebase`).
- Final remote head checked: `origin/patch/chris` matched `8585a3a3c2e47a3b2fda7af05dc62c8e98747ef5`.

## Patch stack accounting

- Pre-rebase local stack: 26 commits on top of `v2026.5.7`.
- Post-rebase local stack: 25 commits on top of `v2026.5.12`.
- Net count: minus 1 commit.
- Original local patch accounting: 24 old commits kept or ported, 2 old commits dropped as obsolete, and 1 new rebase/cutover cleanup commit added.

Dropped old commits:

- `bdd21df8fd fix(bluebubbles): fall back to toolContext.currentMessageId when react omits messageId`
- `1f822936ea fix(bluebubbles): preserve group routes across webhook updates`

Drop reason: `extensions/bluebubbles` exists at `v2026.5.7` but is gone at `v2026.5.12`. The supported owner is now `extensions/imessage`, and the old BlueBubbles route/cache fixes are not directly reusable. Group routing now depends on `channels.imessage.groupAllowFrom` plus the load-bearing `channels.imessage.groups` registry.

Added during the rebase:

- `8585a3a3c2 fix(runtime): finish imessage cutover rebase`

That cleanup commit ported the cron delivery mirror test path from BlueBubbles to iMessage, updated the delivery dispatch channel handling, refreshed the generated config baseline, and resolved small drift in ACPX, Feishu, Telegram test, and channel-streaming call sites.

## Branch diff surface

Diff against `v2026.5.12`: 64 files, 4015 insertions, 301 deletions.

Main retained/ported surfaces:

- agent live model switching and tool-result context guard fixes
- silent reply session-key classification
- cron delivery mirroring, now with iMessage mirror coverage
- SSRF loopback/private-network guard fixes
- auth-profile `/status` display masking
- Feishu parameter alias, topic reply, quoted/root/thread media, reactions, and send tests
- memory-core dreaming exclusions and session-file helpers
- ACPX Codex home bridge
- plugin SDK/tool progress-line collapse and Telegram progress bubble behavior
- runbook/checkpoint docs and generated config baseline

## Runtime and config migration

The live runtime was moved from the BlueBubbles channel to the bundled iMessage channel.

Configured/enabled items:

- `channels.bluebubbles` removed from the active runtime config.
- `channels.imessage.enabled` set to `true`.
- `channels.imessage.cliPath` set to the SSH wrapper that runs `imsg` on the Messages Mac.
- `channels.imessage.remoteHost` set so OpenClaw can SCP remote iMessage attachments.
- `channels.imessage.includeAttachments` set to `true`.
- Local and remote attachment roots set for Messages attachments.
- `channels.imessage.mediaMaxMb` set to `16`.
- `channels.imessage.catchup.enabled` set to `true` with `maxAgeMinutes=120`, `perRunLimit=50`, `firstRunLookbackMinutes=30`, and `maxFailureRetries=10`.
- `channels.imessage.groupPolicy` kept as `allowlist`.
- `channels.imessage.groupAllowFrom` copied from the old allowed group target shape.
- `channels.imessage.groups` contains an explicit allowed group entry and preserved `systemPrompt`.
- `channels.imessage.actions.edit` set to `false` because the current private API probe reports edit selectors unavailable.
- Other private actions remain configured on, gated by the live iMessage probe.

Intentionally not enabled:

- `channels.imessage.coalesceSameSenderDms` remains `false`. Enable only if the operator wants DM split-send coalescing and accepts the added DM dispatch delay.
- `channels.imessage.reactionNotifications` remains at the current default (`own`). Change only if bot-authored tapbacks need a different notification policy.

Known capability gap:

- The live probe reports `sendRichSupportsAttachment=false`, so `reply` plus attachment remains blocked by the installed `imsg` capability. Plain text send, normal media send, read/history/watch, reactions, unsend, read receipts, typing, and group ops are separate surfaces.

Machine-local migrations completed outside the repo:

- Active iMessage account was checked against the expected operator account. The exact address is intentionally not committed here.
- Persistent channel/ACP bindings that referenced `bluebubbles` were migrated to `imessage`.
- Local media subscription entries were migrated away from BlueBubbles.
- The SSH host alias and wrapper were configured for the Messages Mac.
- Runtime config backups were created before iMessage attachment and action-setting edits.

## Validation proof captured

Docs and source review:

- Ran `pnpm docs:list`.
- Read `.agents/runbooks/patch-chris-upstream.md`.
- Read the iMessage migration docs and changelog entries covering BlueBubbles removal, `catchup`, group registry behavior, per-group `systemPrompt`, and `send-rich --file` gating.
- Verified `v2026.5.12:extensions` contains `imessage` and no `bluebubbles`.
- Verified `v2026.5.7:extensions` still contained both `bluebubbles` and `imessage`.

Runtime health:

- `pnpm openclaw gateway status --deep --json` reported CLI `2026.5.12`, LaunchAgent running, config audit ok, RPC ok, and server version `2026.5.12`.
- `pnpm openclaw channels status --probe --channel imessage --json` reported iMessage configured and running, probe ok, private API available and v2 ready, `retractMessagePart=true`, `editMessage=false`, `editMessageItem=false`, and `sendRichSupportsAttachment=false`.
- Event loop probe was not degraded.
- Direct wrapper/account/status checks on the Messages Mac succeeded.
- SSH and SCP to the configured remote host succeeded.
- Read-only historical iMessage attachment staging was proven by fetching one existing attachment path through the configured remote host and matching the expected byte count.

Code validation gap:

- This record does not contain a fresh Testbox `pnpm check:changed --base upstream/main` result captured after the final rebase/cutover commit. The local `blacksmith` CLI was present but not authenticated, so Testbox could not be used from this machine without a login step.
- `pnpm changed:lanes --base v2026.5.12 --json` selected 65 patch-stack paths with `core`, `coreTests`, `extensions`, `extensionTests`, and `docs` lanes.
- `pnpm changed:lanes --base upstream/main --json` selected 638 paths and `all` lanes because moving `upstream/main` had advanced beyond the chosen release tag. For this release-tag patch stack, use the target tag diff to understand local patch risk, and use the `upstream/main` gate only when intentionally validating against moving main.
- Do not treat the branch as fully release-gated until Testbox auth is available and a changed gate is run, or an explicit local fallback is recorded.

Live behavior still requiring operator-approved sends:

- One new iMessage DM turn after the cutover.
- One allowed group-chat turn after the cutover.
- One new inbound attachment sent after the cutover.
- Private action checks the operator actually wants the agent to use: tapback, reply, unsend, group rename/icon/member ops. Do not run destructive or visible group actions without explicit target approval.

## User-facing feature recommendation checklist

Use this table before turning on additional `v2026.5.12` / `v2026.5.9` behavior for the current Social Agent, iMessage, Telegram, Feishu, cron, and ACP setup. Current-state entries intentionally omit account names, phone numbers, chat ids, and secrets.

| Surface                  | Upstream change since `v2026.5.7`                                                                                                       | Current state checked on 2026-05-15                                                                                                                                                    | Recommendation                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BlueBubbles to iMessage  | `channels.bluebubbles` was removed; `channels.imessage` with `imsg` is the supported path.                                              | Active config has `feishu`, `imessage`, and `telegram`; no active BlueBubbles channel, binding, or enabled cron reference.                                                             | Keep the cutover. Do not reintroduce BlueBubbles. Preserve old backups only as history/rollback evidence.                                                                                                                                                                        |
| iMessage catchup         | `channels.imessage.catchup` can replay missed inbound messages after gateway downtime.                                                  | Enabled with `maxAgeMinutes=120`, `perRunLimit=50`, `firstRunLookbackMinutes=30`, and `maxFailureRetries=10`.                                                                          | Keep enabled for Social Agent continuity. Watch first-run replay/catchup logs after restarts before assuming no messages were missed.                                                                                                                                            |
| iMessage attachments     | Native inbound attachment ingestion is supported but off by default; remote hosts need SCP-capable `remoteHost` and roots.              | `includeAttachments=true`, local/remote roots set, `remoteHost` set, `mediaMaxMb=16`; historical SCP staging was proven.                                                               | Keep enabled. Still run one operator-approved new inbound attachment test before disabling the old observation path.                                                                                                                                                             |
| iMessage group prompt    | `channels.imessage.groups.<chat_id>.systemPrompt` now works.                                                                            | One allowed group entry exists and has `systemPrompt`.                                                                                                                                 | Keep. This is the main Social Agent behavior-preservation knob for the family group.                                                                                                                                                                                             |
| iMessage group registry  | Under `groupPolicy=allowlist`, the `groups` registry is load-bearing.                                                                   | `groupPolicy=allowlist`, one `groupAllowFrom`, one explicit group entry.                                                                                                               | Do not delete the `groups` block. If it disappears, allowed group messages can be silently dropped.                                                                                                                                                                              |
| iMessage private actions | `imsg rpc` exposes reactions, replies, unsend, rich send, attachments, read/typing, and group management when the bridge supports them. | Probe ok: private API available and v2 ready; `edit=false`; `retractMessagePart=true`; group/read/typing methods present.                                                              | Keep `edit` off. Use tapback/reply/unsend/group actions only after explicit target approval because they are visible in real chats.                                                                                                                                              |
| Reply plus attachment    | `send-rich --file` is capability-gated.                                                                                                 | Probe reports `sendRichSupportsAttachment=false`.                                                                                                                                      | Do not rely on reply-with-attachment. Send the attachment as a normal media send, or retest after a future `imsg` upgrade.                                                                                                                                                       |
| Tapback notifications    | Tapbacks route as reaction system events; `reactionNotifications` can be `off`, `own`, or `all`.                                        | Left at default, which is effectively bot-authored-message notifications.                                                                                                              | Keep default. Use `all` only if Social Agent should react to every inbound tapback; use `off` if this becomes noisy.                                                                                                                                                             |
| DM split-send coalescing | `coalesceSameSenderDms` can merge consecutive same-sender DM rows into one turn.                                                        | Disabled.                                                                                                                                                                              | Leave disabled for now. Enable only if you see real split DM failures; it adds dispatch delay and does not affect groups.                                                                                                                                                        |
| iMessage read receipts   | iMessage read receipts can be sent by the private API path.                                                                             | Left at default.                                                                                                                                                                       | Decide by privacy preference: keep default if the agent should visibly mark messages read; set false if read receipts from the bot are unwanted.                                                                                                                                 |
| iMessage config writes   | iMessage can initiate config writes by default when command policy allows it.                                                           | Left at default.                                                                                                                                                                       | Consider `channels.imessage.configWrites=false` for family-group safety unless you intentionally configure OpenClaw from iMessage.                                                                                                                                               |
| Group tool policy        | Group `toolsBySender` can restrict tools per sender; deny wins.                                                                         | The allowed iMessage group has `requireMention=false`, no group `tools`, and no `toolsBySender`; Social Agent has no per-agent tool policy; global exec is `security=full`, `ask=off`. | Highest-priority config follow-up: add group-level `toolsBySender` or `tools` restrictions before treating this as fully safe for always-on group use. Deny risky filesystem/exec/gateway mutation tools for `*`, then explicitly allow only trusted operator senders if needed. |
| Cron delivery            | Cron/session delivery and iMessage mirror paths changed; cron state persists outside the repo.                                          | 40 enabled jobs; 19 deliver through iMessage; no active BlueBubbles references.                                                                                                        | Good migration state. Do not manually fire visible iMessage jobs until DM/group/attachment live tests pass. Next audit should sample the 19 iMessage jobs for stale session-key assumptions, not for BlueBubbles channel names.                                                  |
| Social workspace memory  | Agents can be misled by old examples after a channel migration.                                                                         | `workspace-social` tool docs already use iMessage and mark `bb-*` as historical; some older historical memory notes still contain legacy `channel: "bluebubbles"` snippets.            | Runtime is not blocked. If agents start copying old snippets, add a stronger "legacy example only, do not execute" note or split the old migration plan into archive-only memory.                                                                                                |
| Telegram                 | Polling can run in an isolated worker with durable local spool; cron announce formatting was fixed.                                     | Telegram remains enabled with allowlisted groups and 13 enabled cron jobs.                                                                                                             | No config change recommended. The reliability benefit is automatic; keep current stream mode.                                                                                                                                                                                    |
| Feishu                   | Group context and reasoning-preview handling changed.                                                                                   | Feishu remains enabled with 2 enabled cron jobs.                                                                                                                                       | No config change recommended. Keep current routing unless a Feishu-specific failure appears.                                                                                                                                                                                     |
| ACP fallbacks            | `acp.fallbacks` can try backup runtime backends when the primary ACP backend is unavailable before output.                              | Not configured.                                                                                                                                                                        | Do not enable by default. Use only if ACP primary failures become frequent, because fallback can change coding-harness behavior mid-turn.                                                                                                                                        |
| Tool Search              | Experimental PI `tools.toolSearch` can hide large tool catalogs behind compact search/describe/call tools.                              | Disabled; all active agents have model fallbacks; Social Agent is not using a per-agent tool policy.                                                                                   | Do not enable globally for Social Agent or Email. Pilot only on non-critical/coding agents if prompt size from large tool catalogs becomes a real problem.                                                                                                                       |
| Subagent delegation      | `agents.defaults.subagents.delegationMode` adds `suggest` / `prefer` prompt guidance.                                                   | Default remains `suggest`; no per-agent override.                                                                                                                                      | Keep default for Social Agent. Consider `prefer` only for coding/filomail workflows where more background delegation is desired.                                                                                                                                                 |
| Reasoning preview        | Telegram/Feishu honor configured `reasoningDefault`.                                                                                    | Global and Social Agent `reasoningDefault` are unset/off; Social `thinkingDefault=medium`.                                                                                             | Keep reasoning previews off for public/social channels. Do not stream reasoning into chats by default.                                                                                                                                                                           |
| Model fallbacks          | Doctor warns when per-agent model overrides omit `fallbacks`.                                                                           | Six active agents exist; all have explicit model fallbacks.                                                                                                                            | No action. Preserve fallback arrays when editing agent model config.                                                                                                                                                                                                             |
| Update/doctor repair     | Update snapshots and doctor/plugin repair behavior changed.                                                                             | Read-only health/config checks were used; Testbox broad gate is still blocked by missing Blacksmith auth.                                                                              | Keep the runbook red line: do not run `doctor --fix` casually. Run read-only status first, back up config, inspect diffs, then repair only the named problem.                                                                                                                    |
| Health recheck           | `channels status --probe --channel imessage` can now target iMessage without starting both monitors.                                    | Latest recheck: iMessage probe ok, but event loop was CPU-degraded on that run.                                                                                                        | Treat iMessage as connected, but run an idle recheck before heavy rollout or visible cron firing so host load is not mistaken for channel failure.                                                                                                                               |

## Red lines for the next operator

- Do not run `doctor --fix` casually on this upgrade path. Use read-only doctor/status first, back up config, and inspect the diff if a repair is truly needed.
- Do not reintroduce `channels.bluebubbles`; the channel surface was removed at `v2026.5.12`.
- Do not drop the `channels.imessage.groups` block while `groupPolicy` is `allowlist`; group messages can be dropped even when `groupAllowFrom` matches.
- Do not run `imsg launch` unless the private API probe says the bridge is unavailable or a specific action fails with a bridge-required error. It can relaunch Messages.app.
- Do not promise automatic BlueBubbles transcript/session-key continuity. Preserve backups, but new traffic uses iMessage channel keys.
- Do not disable the old BlueBubbles observation path until DM, group, attachment, and chosen private-action checks have passed.
- Do not upgrade `imsg` on the Messages Mac without rerunning `status`, `chats`, `history`, `watch`, OpenClaw channel probe, and one operator-approved send.
