# patch/chris v2026.6.11 升级记录

- Source tag: `v2026.6.10` (`aa69b12d00`)
- Target tag: `v2026.6.11` (`e085fa1a3f`, GitHub stable release / npm latest)
- Previous local head: `b4e0c2404a` before adding this record and 6.11 generated metadata
- Rebase base: `v2026.6.11`
- Backup policy: no extra backup tag/tarball. This is Chris local `patch/chris`; `origin/patch/chris`, release tags, and reflog are enough.

## 结论

升。收益集中在本机真实会用到的 runtime 稳定性：

- Channel delivery: Telegram progress / webhook / queued update draining improved.
- Gateway and session safety: stuck release claims, remote probe timeout, draining-state reporting, bound channel identity all safer.
- Agent and fallback: aborted tool runs stop cleanly, provider error bodies are bounded, Codex usage-limit and Claude CLI credit failures classify better.
- Cron delivery validation: no-config delivery checks, thread-aware dedupe, recurring pending run retention improved.
- UI/config security: DOMPurify patched, non-interactive configure fails closed, TLS empty paths rejected.

Slack relay, Mattermost `/oc_queue`, Android settings panels, WhatsApp quote/JID fixes, and mobile exec approval work are not current local drivers, so this upgrade was not tested around them.

## 最近 3 天使用审计

Evidence window: local OpenClaw config, cron SQLite, and `~/.openclaw/agents/*/sessions/*.trajectory.jsonl` modified in the last 3 days.

- Active channels: `telegram`, `feishu`, `imessage`.
- Active agents: `main`, `email`, `ivy`, `filomail`, `social`, `cron-bot`.
- Current plugin entries do not include `memory-core`, `memory-wiki`, or `active-memory`.
- Recent session files by agent: `email` 558, `main` 334, `social` 314, `cron-bot` 311, `filomail` 290, `ivy` 8.
- Recent trajectory calls: 942 session runs, 1177 tool calls.
- Top tools: `bash` 883, `cron` 93, `web_search` 44, `gateway` 36, `memory_search` 33, `message` 24, `web_fetch` 19, `conversation_archive_search` 14.
- Dreaming calls: 0. `memory_get`: 1. `memory_search` was only `main` 28 + `email` 5, not dream cron activity.
- Disabled memory/dream jobs still disabled: `dreaming-daily-report`, `global-wiki-organizer-daily`, `filomail-work-memory-handoff`, `personal-inbox-daily-consolidation`, `Obsidian记忆存档`, `personal-files-merge-and-report`.

## Aggressive drop 清单

Dropped in this rebase:

- `fix(memory-core): exclude configured agents from dreaming sweeps`
- `feat(memory-core): excludeGroupIds dream filter + cleanup script`
- `chore: regen config metadata for v2026.6.10`
- `fix(imessage): default imsg send transport to "auto"...`
- `fix(gateway): reset channel auto-restart attempts after stable run`
- `fix(telegram): recover failed final delivery`
- `fix(telegram): route 'upload-file'...`

Rationale:

- Dream/memory-core features are off locally and had 0 recent `dreaming` calls. If dreaming is re-enabled later, re-evaluate against 6.11's upstream memory/session accessor changes instead of carrying the old local filters.
- Telegram itself is active, but the old local final-delivery/upload-file edge paths had no recent evidence and 6.11 already includes multiple upstream Telegram delivery fixes. Bring back only if the exact failure recurs.
- iMessage itself is active, but the old send-transport default patch is an old incident workaround; no recent transport failure was found in this audit.
- Gateway restart-attempt reset is low-value until a repeated restart/backoff symptom reappears.
- Generated metadata is always dropped and regenerated for the target tag.

## Kept patches

- Feishu referenced-media handling:
  - `fix(feishu): pull attachments from quoted/root/thread history`
  - `fix(feishu): download rich-text referenced media`
  - `fix(feishu): use saved resource helper for referenced media`
- Feishu sender-name 41050 cache/silence patch.
- Live session model switch patch: `fix(agents): respect caller-supplied model in live session switch check`.
- Runbook records and post-upgrade gate.

## Rebase / generation

- Rebase command shape: `git rebase --onto v2026.6.11 v2026.6.10`.
- Conflict: `AGENTS.md`; resolved by keeping upstream 6.11 existing-solutions preflight plus local `patch/chris` runbook routing.
- Regenerated:
  - `docs/.generated/config-baseline.sha256`
  - `src/config/bundled-channel-config-metadata.generated.ts`
- `config:schema` is runtime-computed; no generated file to write.

## Verification before record commit

- `git diff --check`: OK.
- `rg -n '^(<<<<<<<|=======|>>>>>>>)' -- .`: only separator-line false positives in `scripts/codesign-mac-app.sh`.
- `node --import tsx scripts/generate-config-doc-baseline.ts --check`: OK.
- `node --import tsx scripts/generate-bundled-channel-config-metadata.ts --check`: OK.
- `node --import tsx scripts/generate-base-config-schema.ts --check`: OK.
- `node scripts/run-vitest.mjs extensions/feishu/src/bot-content.referenced-media.test.ts`: OK, 6 tests.
- `node scripts/run-vitest.mjs extensions/feishu/src/bot-sender-name.test.ts`: OK, 8 tests.
- `node scripts/run-vitest.mjs src/agents/live-model-switch.test.ts`: OK, 22 tests.
- First build failed because local `node_modules/acpx` was `0.10.0` while the 6.11 lockfile requires `0.11.2`; `pnpm install --frozen-lockfile` updated the dependency but was interrupted after core sync because optional cross-platform package downloads kept retrying.
- `node_modules/acpx/package.json`: `0.11.2`.
- `pnpm build`: OK after the dependency sync.
- `ls dist-runtime/extensions/litellm/openclaw.plugin.json`: OK.
- `node --input-type=module -e 'await import("./dist/index.js")'`: OK.
- `pnpm openclaw config validate`: OK; it rebuilt stale dist because the tree was dirty with regenerated files.

## Final proof

After committing the 6.11 metadata and this record, the final local proof was:

- `openclaw-local-ops` references refreshed: 680 docs, 9225 schema paths.
- Final `pnpm build`: OK.
- `openclaw gateway install --force --json`: OK / LaunchAgent loaded. It reported the existing legacy config-health JSON conflict warning, not a startup failure.
- CLI/gateway/RPC all report `2026.6.11`.
- Gateway service: running; config audit OK; plugin drift empty.
- `openclaw health --json`: OK; event loop not degraded.
- `openclaw channels status --probe --channel imessage --json`: configured, running, probe OK; event loop not degraded.
- `origin/main`: `v2026.6.11`.
- `origin/patch/chris`: pushed to this rebased `patch/chris` head.
- `node .agents/scripts/patch-chris-post-upgrade-gate.mjs`: passed.

Deep checks intentionally not run: full CI, broad channel suites, Crabbox/Testbox, Android/iOS/mobile release QA, Slack/Mattermost/WhatsApp feature tests.
