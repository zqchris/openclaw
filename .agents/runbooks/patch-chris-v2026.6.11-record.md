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

## 新功能 / 变化导读

这版不是单一大功能版，更像一次 channel / gateway / agent runtime 稳定性合并。按 Chris 当前用法，重点如下：

### 本机高相关

- Telegram delivery 更稳：progress draft、webhook lifecycle、queued update draining、reaction directive、mirror write dedupe 等多处修复。Chris 仍把 Telegram 当成主要控制/日报入口，所以这部分值得升，但也让旧本机 Telegram recovery/upload-file 补丁不再默认保留。
- Gateway session safety 更稳：stuck release claims、draining state、remote probe timeout、malformed paired access lists、non-delivery session identity 都有修复。对应本机长期运行 gateway、cron、channel probe 的稳定性。
- Agent turn / fallback 更稳：aborted tool run 会更干净地停下；provider response body 有边界；Claude CLI credit failure、Codex usage-limit payload 能更正确进入 fallback/分类逻辑。对应 Chris 的长会话、多 provider fallback 和 Codex session 使用。
- Cron delivery validation 更稳：no-config delivery check、thread-aware failure-destination dedupe、pending recurring run retention 都有修复。对应本机 GitHub daily、晨报、财务/票据/TapDB 等 cron。
- UI/config 安全边界更好：DOMPurify patched release、non-interactive configure fails closed、TLS empty path reject。不是每天直接用，但属于低成本的安全/配置防错收益。
- Provider/model 兼容性增强：OpenRouter canonical IDs、Ollama/Gemini/model catalog prefix、encrypted reasoning 等处理更完整。当前主路径是 OpenAI/LiteLLM/Claude/Gemini 等多 provider 组合，属于潜在稳定性收益。

### 本机低相关 / 暂不作为升级理由

- Slack relay mode：当前本机主 channel 不是 Slack。
- Mattermost native `/oc_queue`：当前不用 Mattermost。
- Android settings detail panels / mobile exec approval UX：当前这次没有 Android/mobile QA。
- WhatsApp native quote / JID drift / durable reply fixes：当前本机主 channel 不含 WhatsApp。
- Native plugin icon manifest、official plugin externalization：对安装/插件生态有用，但不是 Chris 本机 runtime 当前痛点。
- RAFT CLI wake bridge、`openclaw agent --message-file`：是有用的新 operator path，但本轮没有把它纳入本机工作流验证。

## 功能开关建议

本轮建议：不要主动打开新的 channel / plugin / cron / memory 功能。6.11 对 Chris 的主要收益是默认生效的稳定性修复，不需要改 `~/.openclaw/openclaw.json`。

### 建议现在打开

- 无。没有发现一个新功能值得在这轮升级里立即改配置开启。

### 只观察或按需使用

- `openclaw agent --message-file`：不需要配置。适合以后把长 prompt / 长报告 / 大段 release note 文件化传给 agent，先按需用，不需要改常驻配置。
- Per-agent usage-cost reporting：不需要配置。以后排查某个 agent 或 cron 费用时再用，不需要持续开启。
- Per-DM model override / `directUserId`：只有当某个 DM 明确需要固定更强或更便宜模型时再配置；当前 Telegram / Feishu / iMessage 路由没有证据需要立刻改。
- RAFT CLI wake bridge：先观察。除非明确要从外部系统远程唤醒本机 OpenClaw，否则不打开。

### 暂不打开

- Slack relay mode：当前本机不使用 Slack 作为主入口。
- Mattermost `/oc_queue`：当前不用 Mattermost。
- WhatsApp quote / JID / durable reply 相关能力：当前本机没有 WhatsApp 主路径。
- Android settings panels / mobile exec approval UX：当前没有 Android/mobile 运行链路验证。
- Memory / Dreaming：继续保持关闭。最近 3 天 `dreaming` 调用为 0，旧 Wiki / Dreaming 已不是 Chris 的个人记忆入口。
- ACP/acpx runtime：继续不启用；本轮只同步了 6.11 所需 `acpx@0.11.2` 依赖以保证 build。

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

## 实际保留 patch stack

`git log --oneline v2026.6.11..patch/chris` after this upgrade contains the local stack below. The code-affecting local patches kept are:

- `f8ac5b38e6 fix(feishu): use saved resource helper for referenced media`
- `e09607dc5a fix(feishu): download rich-text referenced media`
- `0ec8d78dac fix(feishu): silence and cache 41050 'no user authority' on sender-name lookup`
- `a085c660fb fix(feishu): pull attachments from quoted/root/thread history`
- `d67d66ffc0 fix(agents): respect caller-supplied model in live session switch check`

Operational/docs/generated commits kept:

- `b9749ce1c8 chore: regen config metadata for v2026.6.11`
- `b4e0c2404a chore: enforce patch/chris post-upgrade gate`
- `59829986c8 docs(runbook): record v2026.6.10 upgrade`
- `fddaa05cc1 docs(runbook): streamline patch/chris upgrade flow`
- Current and older upgrade records from `v2026.5.12` through `v2026.6.11`, retained as local maintenance history.
- This follow-up runbook clarification, which makes feature intro and actual kept patch stack mandatory in future records.

Kept rationale:

- Feishu referenced media / rich-text / quoted-root-thread patches are still part of the actual Feishu workflow surface, and the targeted tests pass.
- Feishu 41050 sender-name cache/silence remains a low-risk local noise reduction for known Feishu API behavior.
- Live session model switch remains relevant to Chris's interactive model/session workflow.
- Runbook/gate commits are local operating safety rails, not upstream product behavior.

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
