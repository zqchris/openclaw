# patch/chris v2026.5.18 update record

Date: 2026-05-19.

Purpose: upgrade `patch/chris` from `v2026.5.16-beta.4` to the latest formal release tag `v2026.5.18` after Chris explicitly confirmed stable-only. `v2026.5.19-beta.1` existed but was intentionally not used.

## Source and target

- Installed/runtime version before this maintenance window: `OpenClaw 2026.5.16-beta.4 (3afad61)`.
- Source tag: `v2026.5.16-beta.4` (`38c3a8dd48df571697cc752ce56dfc4920e2faa4`).
- Target formal tag: `v2026.5.18` (`50a2481652b6a62d573ece3cead60400dc77020d`).
- Backup tag: `rebase-backup/patch-chris-pre-v2026.5.18-20260519` (`3afad61ebcdd72edeb782b1498beb225f726fd8d`).
- Post-rebase head before this record: `2ab611b5f978dc834de66011c4fd15b8764b82da`.
- Local `main` is locked to `v2026.5.18`.
- Branch diff against `v2026.5.18`: 46 files, 3342 insertions, 227 deletions.

## Backup

- `pnpm openclaw backup create --verify --output ~/Backups` first reconciled dependencies, then hung in the pnpm wrapper before launching the backup subcommand.
- The hung wrapper was stopped and retried via the existing CLI entrypoint:
  `node dist/index.js backup create --verify --output /Users/chris/Backups`.
- Backup archive: `/Users/chris/Backups/2026-05-19T02-47-09.675Z-openclaw-backup.tar.gz`.
- Archive verification: passed.
- Volatile files skipped: 7191.

## Patch audit result

Chris approved this audit before rebase. Dropped commits were removed from the interactive rebase todo before any rebase conflict resolution.

### Dropped local commits

| Old SHA      | Title                                                                                | Upstream status in `v2026.5.18`                    | Reason                                                                                         |
| ------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `3ef9c0ceeb` | fix(agents): stop counting tool-result details toward context guard budget           | Covered by upstream `ac848d318d`                   | Same behavior and regression tests now shipped                                                 |
| `fdaa358504` | fix(agents): strip trailing empty assistant turn before model fallback               | Superseded by upstream replay-history sanitization | Upstream handles provider-boundary replay with narrower semantics                              |
| `db2be9032b` | fix(agents): only validate transformed tool-result middleware output                 | Superseded by upstream `a4bea46a35`                | Upstream sanitizes/coerces incoming middleware results instead of preserving identity          |
| `9fab9e784b` | fix(runtime): finish imessage cutover rebase                                         | No longer needed                                   | Pure stale rebase/test-format residue                                                          |
| `ea9b02a98f` | fix(telegram): delete tool-progress draft when sending final answer in progress mode | Already fixed in `v2026.5.18`                      | `rotateAnswerLaneAfterToolProgress()` already calls `clear()`, and `clear()` deletes the draft |
| `7db9c054b5` | fix(telegram): exit ingress worker cleanly when stop requested                       | Covered by upstream `395bd578d2`                   | Upstream also closes `parentPort` and preserves clean stop exit                                |

### Kept commits

| New SHA      | Title                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- |
| `d33f4fd3e3` | fix(agents): respect caller-supplied model in live session switch check                   |
| `7a795a6f7c` | fix(ssrf): honor allowPrivateNetwork for loopback hostnames + keep cloud metadata blocked |
| `a7079497c9` | fix(silent-reply): classify thread sessionKeys correctly                                  |
| `ad39e1c00f` | fix(auth-profiles): mask emails in /status display labels                                 |
| `ab2722ee25` | fix(feishu): list accepted parameter aliases in tool error messages                       |
| `47c46bf466` | fix(memory-core): exclude stable cron sessions from dreaming                              |
| `95018287a1` | fix(feishu): preserve topic reply anchors                                                 |
| `ee31f8d44c` | fix(feishu): pull attachments from quoted/root/thread history                             |
| `ad16652f9e` | test(feishu): cover resolveFeishuReferencedMessageMedia (cache + budget paths)            |
| `386b62fc70` | fix(telegram): drop monospace wrap from tool progress bubble                              |
| `a801787e6b` | docs(runbook): add patch/chris upstream runbook + 5.12 update record                      |
| `d34a2be30b` | docs(runbook): record v2026.5.16-beta.4 emergency upgrade                                 |
| `2ab611b5f9` | docs(runbook): document acpx disabled state                                               |

## Conflict resolutions

- `b2e00208b5 fix(feishu): preserve topic reply anchors` conflicted in `extensions/feishu/src/bot.ts` with upstream inbound last-route refresh work. Resolution kept local `replyTargetMessageId`, `typingTargetMessageId`, and `MessageThreadId` anchor semantics while preserving upstream `buildFeishuInboundLastRouteUpdate`, configured-binding, runtime-binding, and pinned-main-DM route behavior.
- `4765936fcb fix(memory-core): exclude stable cron sessions from dreaming` replayed without text conflict, but was manually audited after rebase. Final diff keeps only the missing local semantics on top of upstream: stable cron session-key classification, internal automation transcript filtering, human-driven turn extraction, `dreaming.excludeAgents`, and dreaming narrative transcript markers.

## Post-rebase fixup

- `43c0069925 fix(feishu): repair v2026.5.18 rebase fallout` fixes issues exposed by validation after the rebase:
  - restores the missing `downloadMessageResourceFeishu` import used by referenced-media download code,
  - removes the stale `toMessageResourceType` import left by the conflict resolution,
  - fixes a malformed `expect.objectContaining(...)` call in `extensions/feishu/src/send.test.ts`,
  - aligns the thread media-send test with the current `replyToId: undefined` call shape,
  - renames the test cache clearer to satisfy the no-leading-underscore lint rule.

## Validation

- `git diff --check`: passed.
- Core/Telegram targeted tests passed:
  `pnpm test src/agents/live-model-switch.test.ts src/infra/net/ssrf.test.ts src/shared/silent-reply-policy.test.ts src/agents/auth-profiles/display.test.ts extensions/telegram/src/bot-message-dispatch.test.ts -- --reporter=verbose`.
- Feishu targeted tests passed:
  `pnpm test extensions/feishu/src/bot.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/send.test.ts extensions/feishu/src/outbound.test.ts extensions/feishu/src/reactions.test.ts -- --reporter=verbose`.
- Memory targeted tests passed:
  `pnpm test packages/memory-host-sdk/src/host/session-files.test.ts src/memory-host-sdk/dreaming.test.ts extensions/memory-core/src/dreaming-phases.test.ts extensions/memory-core/src/dreaming-narrative.test.ts -- --reporter=verbose`.
- Referenced-media rename smoke passed:
  `pnpm test extensions/feishu/src/bot-content.referenced-media.test.ts -- --reporter=verbose`.
- `pnpm check:changed`: passed after the Feishu fixup above. The lane detector reported `lanes=all` because `origin/patch/chris` still points at the old stack, so the branch comparison includes upstream formal-release changes.
- `pnpm build`: passed after cleaning `dist/` and `dist-runtime/`.
- CLI entrypoint import passed:
  `node --input-type=module -e 'await import("./dist/index.js")'`.
- CLI version after build: `OpenClaw 2026.5.18`.
- Config validation passed:
  `node dist/index.js config validate`.

## Notes

- No gateway restart was performed during this maintenance window.
- The installed source tree and built CLI are updated, but the launchd-managed gateway process still needs an explicit restart before it begins running the newly built code.
