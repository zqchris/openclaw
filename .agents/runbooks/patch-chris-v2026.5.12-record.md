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

- This record does not contain a fresh Testbox `pnpm check:changed --base upstream/main` result captured after the final rebase/cutover commit. Do not treat the branch as fully release-gated until that is run or an explicit local fallback is recorded.

Live behavior still requiring operator-approved sends:

- One new iMessage DM turn after the cutover.
- One allowed group-chat turn after the cutover.
- One new inbound attachment sent after the cutover.
- Private action checks the operator actually wants the agent to use: tapback, reply, unsend, group rename/icon/member ops. Do not run destructive or visible group actions without explicit target approval.

## Red lines for the next operator

- Do not run `doctor --fix` casually on this upgrade path. Use read-only doctor/status first, back up config, and inspect the diff if a repair is truly needed.
- Do not reintroduce `channels.bluebubbles`; the channel surface was removed at `v2026.5.12`.
- Do not drop the `channels.imessage.groups` block while `groupPolicy` is `allowlist`; group messages can be dropped even when `groupAllowFrom` matches.
- Do not run `imsg launch` unless the private API probe says the bridge is unavailable or a specific action fails with a bridge-required error. It can relaunch Messages.app.
- Do not promise automatic BlueBubbles transcript/session-key continuity. Preserve backups, but new traffic uses iMessage channel keys.
- Do not disable the old BlueBubbles observation path until DM, group, attachment, and chosen private-action checks have passed.
- Do not upgrade `imsg` on the Messages Mac without rerunning `status`, `chats`, `history`, `watch`, OpenClaw channel probe, and one operator-approved send.
