# patch/chris v2026.6.10 升级记录

- Source tag: `v2026.6.9`
- Target tag: `v2026.6.10` (2026-06-24 stable / GitHub latest)
- Previous local head: `99fef0f9e3` (`origin/patch/chris` before this upgrade)
- Rebase base: `v2026.6.10`
- Backup policy: no extra backup tag/tarball. This was a local source upgrade; `origin/patch/chris`, release tags, and reflog are enough.

## 结论

升。收益主要是 runtime 稳定性，不是必须手动开启的新大功能：

- `/fast auto` becomes bounded and visible: short calls start fast; later retry/fallback/tool-result/continuation calls can drop back to non-fast after the cutoff.
- Zai/GLM routing and reasoning-level metadata are more consistent.
- Session/channel state is safer across channel switches and cron target-session delivery.
- Trusted policies survive hook registry composition.
- Provider onboarding refreshes plugin registry after setup installs.

## Runbook cleanup

Before upgrading, `.agents/runbooks/patch-chris-upstream.md` was rewritten from a long release-style checklist into a shorter local-ops flow:

- Check-update now starts with release notes, not local rebase mechanics.
- Default upgrade path is rebase/build/restart/health check.
- Large backup/tag/daily-backup checks are not default.
- Patch audit is lightweight unless runtime conflicts appear.
- Final build/restart after record commits is explicit to avoid source-checkout stale-dist drift.

## Patch audit

- Dropped: old generated metadata commit `cc2fd4912d chore: regen config metadata for v2026.6.9`.
- Kept: existing runtime patches for Feishu referenced media / 41050 cache, Telegram recovery/actions, iMessage send transport, memory-core dream filters, gateway restart-attempt reset, live model switch.
- Added during this upgrade:
  - `docs(runbook): streamline patch/chris upgrade flow`
  - `chore: regen config metadata for v2026.6.10`
  - `fix(feishu): use saved resource helper for referenced media`

## Rebase / fix

- Rebase command shape: `git rebase --onto v2026.6.10 v2026.6.9 patch/chris`.
- Only expected conflict was the old generated baseline; skipped that commit and regenerated for 6.10.
- First build caught a real 6.10 API drift: `downloadMessageResourceFeishu` is no longer exported by `extensions/feishu/src/media.ts`.
- Fix: referenced-media now calls 6.10's `saveMessageResourceFeishu()` directly and uses `result.saved.size` for budget accounting instead of downloading a buffer and saving it again.

## Verification

- Generation:
  - `node --import tsx scripts/generate-config-doc-baseline.ts --write`: OK.
  - `node --import tsx scripts/generate-bundled-channel-config-metadata.ts --write`: OK.
  - Matching `--check` commands: OK.
- Targeted test:
  - `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false node scripts/run-vitest.mjs extensions/feishu/src/bot-content.referenced-media.test.ts`: OK, 6 tests.
- Build/import/config:
  - `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm build`: OK after Feishu API fix.
  - `ls dist-runtime/extensions/litellm/openclaw.plugin.json`: OK.
  - `node --input-type=module -e 'await import("./dist/index.js")'`: OK.
  - `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm openclaw config validate`: OK.

## Notes

- `pnpm config:*` initially triggered pnpm's dependency pre-run check and hung on optional platform package downloads. It was interrupted and rerun via direct `node --import tsx` scripts.
- Because this record commit changes `HEAD`, do a final build and gateway restart after committing it.
- Deep checks not run by default: full CI, full `check:changed`, broad Feishu/Telegram/iMessage test suite. Risk is accepted for this local gateway update because runtime conflict scope was one Feishu helper and its narrow test passed.

## Missed post-upgrade step fixed

Chris pointed out the same post-upgrade miss recurred again: the Obsidian upgrade note and local ops reference refresh were not enforced by the runbook.

Applied immediately:

- Wrote Obsidian note: `~/Documents/ChrisData/Agent/main/upgrades/2026-06-25.md`.
- Refreshed `openclaw-local-ops` references: 676 docs, 9190 schema paths.
- Added `.agents/scripts/patch-chris-post-upgrade-gate.mjs`.
- Updated the main runbook so final completion requires the gate after push.
