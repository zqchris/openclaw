# patch/chris v2026.5.19 update record

Date: 2026-05-21.

Purpose: upgrade `patch/chris` from `v2026.5.18` to the latest formal release
tag `v2026.5.19`. `v2026.5.20-beta.1` existed locally after tag fetch, but was
intentionally not used.

## Source and target

- Installed/runtime version before this maintenance window: `OpenClaw 2026.5.18 (7c56a6b)`.
- Source tag: `v2026.5.18` (`50a2481652b6a62d573ece3cead60400dc77020d`).
- Target formal tag: `v2026.5.19` (`a185ca283a74092d3840d0c81c53cf02e25024e8`).
- Official tag object: `dc44220d5289c2777c9db7e47eeb1cf60bf9e49c`.
- Local tag mismatch fixed before upgrade: stale local `v2026.5.19` pointed at
  `eab57ad8adbdc391f27d4092c6dfbae68a7a194a`; it was deleted and refetched from
  upstream before pushing the official tag to the fork.
- Backup tag: `rebase-backup/patch-chris-pre-v2026.5.19-20260521`
  (`7c56a6bba85224196defcf1879664d5a3652fba8`).
- Local `main` and `origin/main` were moved to `v2026.5.19^{}`.
- Fork tag `origin/v2026.5.19` was created.
- Post-port head before this record: `fbc610e80343`.

## Backup

- Command: `pnpm openclaw backup create --verify --output ~/Backups`.
- Backup archive: `/Users/chris/Backups/2026-05-21T00-05-36.037Z-openclaw-backup.tar.gz`.
- Included path: `~/.openclaw`.
- Volatile files skipped: 7587.
- Archive verification: passed.

## Patch audit result

The upgrade did not use plain `git rebase main` because `v2026.5.19` is not a
linear descendant of the fork's old `v2026.5.18` release point. Replaying from
the merge-base would have reapplied old release-prep commits on top of 5.19.
Instead, only commits after `v2026.5.18` were replayed onto `main`.

### Dropped local commits

| Old SHA      | Title                                           | Upstream status in `v2026.5.19`                                                    | Reason                                                                            |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `fcc73477ed` | fix(agents): avoid fallback on session takeover | Covered by `6a5a1353c7 fix(agents): skip fallback for session coordination errors` | Upstream handles session coordination errors directly in fallback classification. |
| `dbaa73ee2f` | fix(agents): drop stale codex encrypted replay  | Covered by `a54c73687f fix(agents): provenance-bound Codex reasoning replay`       | Upstream adds broader provider/session-bound encrypted reasoning replay handling. |

### Kept local commits

- `e7952cdb7f` fix(agents): respect caller-supplied model in live session switch check
- `416d0cbac` fix(ssrf): honor allowPrivateNetwork for loopback hostnames + keep cloud metadata blocked
- `f5c5513aa` fix(silent-reply): classify thread sessionKeys correctly
- `f938448a37` fix(auth-profiles): mask emails in /status display labels
- `3145fd92ad` fix(feishu): list accepted parameter aliases in tool error messages
- `53b44d05ee` fix(memory-core): exclude stable cron sessions from dreaming
- `a33cf2f418` fix(feishu): preserve topic reply anchors
- `50f65eebaf` fix(feishu): pull attachments from quoted/root/thread history
- `e6387be528` test(feishu): cover resolveFeishuReferencedMessageMedia
- `8638a67cb7` fix(telegram): drop monospace wrap from tool progress bubble
- `442a7286fb` docs(runbook): add patch/chris upstream runbook + 5.12 update record
- `9d7268878d` docs(runbook): record v2026.5.16-beta.4 emergency upgrade
- `dac03baf89` docs(runbook): document acpx disabled state
- `2a8dea2062` fix(feishu): repair v2026.5.18 rebase fallout
- `6aba63cd93` docs(runbook): record v2026.5.18 update
- `2d670653f0` fix(feishu): preserve topic reply anchors
- `6ffbc11853` fix(telegram): recover failed final delivery
- `b2cf462696` fix(imessage): recover malformed chat zero payloads

### Post-port fixups

- `67b193eb9e` aligns one Telegram progress-draft test expectation with the
  no-monospace formatting kept from the local patch.
- `fbc610e803` types the iMessage conversation-repair RPC mock for the extension
  test typecheck lane.

## Conflict resolutions

- `extensions/telegram/src/bot-message-dispatch.test.ts`: kept 5.19's progress
  label and blank-line formatting, while preserving the local no-backtick
  progress-line behavior.
- `CHANGELOG.md`: kept the upstream 5.19 entries and inserted the local iMessage
  `chat_id=0` repair note into the same Fixes section.
- iMessage production files replayed without semantic conflict; the only follow-up
  was removing unnecessary default generic arguments from `client.request(...)`.

## Validation

- `pnpm install --frozen-lockfile`: passed.
- `pnpm build`: passed after cleaning `dist/` and `dist-runtime/`.
- `pnpm check`: passed on current head before this record.
- Targeted tests passed:
  - Core/agents/SSRF/silent/auth subset: passed in the combined targeted run.
  - Feishu targeted tests: passed in the combined targeted run.
  - Telegram targeted tests: passed after updating the progress-draft expectation
    (`extensions/telegram/src/bot-message-dispatch.test.ts`,
    `bot-message.test.ts`, `channel.message-adapter.test.ts`,
    `outbound-recovery.test.ts`; 96 tests passed).
  - iMessage targeted tests: passed after typing the RPC mock
    (`monitor.gating.test.ts`, `monitor/conversation-repair.test.ts`;
    24 tests passed).
- `pnpm check:changed --base upstream/main`: passed after the iMessage test type fix.
- `pnpm openclaw config validate`: passed before this record; the only later code
  changes were test/runbook files.
- `dist-runtime/extensions/litellm/openclaw.plugin.json`: present.
- `node --input-type=module -e 'await import("./dist/index.js")'`: passed before
  this record; final dist was rebuilt after the record commit.

## Runtime notes

- No OpenClaw gateway restart was performed.
- Build/update work only changed the checkout and `dist` for the next restart.
- The launchd-managed gateway keeps running the old in-memory code until Chris
  explicitly restarts it.
