# patch/chris v2026.6.5 升级记录

- Source tag: `v2026.6.1`
- Target tag: `v2026.6.5` (2026-06-10 当前上游 latest stable)
- 回滚锚点: `pre-upgrade-v2026.6.5` -> 旧 `patch/chris` (已 push 到 origin)
- fork/main: 已推到 `v2026.6.5^{}`
- patch/chris rebase 基线: `main` = `v2026.6.5`
- patch/chris HEAD before this record: `a2cf2c0e48`

## 决定

升。收益主要不是单点新 UI,而是 6.2 -> 6.5 对当前运行面有直接稳定性收益:

- Gateway / doctor / service env: legacy cron JSON store 迁移、service env placeholder 修复、post-upgrade probes 更稳。
- Auth/state: auth profiles 迁到 per-agent SQLite,plugin install state 更耐重启。
- Agent/provider: MCP richer tool-result block coercion、Anthropic extended-thinking 恢复、prompt/cache/tool-name guard、provider catalog recovery。
- Channels: Feishu rate-limit retry、iMessage timeout/error 解释和 coalescing 修复、outbound delivery retry 预算 deferral 后可恢复。
- 可选新能力: Parallel bundled `web_search` provider；需要配置 `PARALLEL_API_KEY` 才有价值,本轮未主动启用。

## 补丁审计结果

本轮先按 `v2026.6.5..patch/chris` 审计,不是边 rebase 边猜。最终 26 个旧补丁里 23 keep / 3 drop,再新增 1 个 6.5 生成物提交。

| 补丁                                        | 目的                                                         | 上游 6.5 / 当前本机现状                                                                                                                                                                                                 | 结论         |
| ------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `428aabde81` SSRF allowPrivateNetwork       | 让 opt-in private network 放行 loopback/LAN provider baseUrl | 当前本机 provider baseUrls 都是公网域名；6.5 browser private-network path 已有 `resolvePinnedHostnameWithPolicy` opt-in,仍挡 metadata/link-local；本地补丁只改 direct `isBlockedHostnameOrIp(host, policy)` helper 语义 | drop         |
| `358251dd81` silent-reply thread sessionKey | 让 generic thread + surface fallback 分类为 thread           | 当前 sessions 有 9 个 direct thread keys、0 个 generic thread keys；direct thread 不受影响；当前运行没有这个强需求                                                                                                      | drop         |
| `dd3a02d511` 6.1 generated metadata         | 6.1 生成文件                                                 | 6.5 schema/channel/docs baseline 必须重新生成,不能保留旧 hash                                                                                                                                                           | drop + regen |

其余 keep: live-model-switch、Feishu quoted/root/thread attachment、Feishu 41050 negative cache、Telegram final delivery / action routing / suppressed network failure、iMessage auto transport、memory-core dream filters、gateway auto-restart reset、runbook/docs 记录。

## Rebase / 冲突

- Rebase 命令用 interactive sequence 预先 drop 3 个已审计补丁,然后 `--onto main v2026.6.1 patch/chris`。
- `extensions/imessage/src/send.ts`: 6.5 新增长 send timeout default,本地新增 `transport` default。解法:保留两者,`timeoutMs` 继续走 `DEFAULT_IMESSAGE_SEND_TIMEOUT_MS`,transport 默认 `"auto"`。
- `extensions/feishu/src/bot-sender-name.test.ts`: 仅测试文件头部冲突。解法:保留 6.5 dynamic import / beforeEach 结构,合入 41050 negative cache 测试。
- iMessage transport 测试 rebase 后触发 `unbound-method` lint。解法:使用文件内既有 `getClientMocks(client).request` helper,并 autosquash 回原 iMessage transport 补丁,未新增功能补丁。

## 生成物

- 先 `pnpm install --frozen-lockfile` 确认依赖已齐。
- 重新生成:
  - `pnpm config:schema:gen`
  - `pnpm config:channels:gen`
  - `pnpm config:docs:gen`
- 生成提交: `a2cf2c0e48 chore: regen config metadata for v2026.6.5`

## 验证

### 静态 / 生成

- `pnpm config:schema:check && pnpm config:channels:check && pnpm config:docs:check`: OK
- `git diff --check`: OK
- conflict marker scan on changed files: no matches

### Targeted Vitest

- `pnpm test src/agents/live-model-switch.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel-actions.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/memory-host-sdk/dreaming.test.ts extensions/memory-core/src/dreaming.test.ts extensions/imessage/src/send.test.ts src/gateway/server-channels.test.ts`: OK, 7 Vitest shards, 341 tests.
- Post-autoreview Feishu rerun `pnpm test extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts`: OK, 5 files, 165 tests.
- Post-second-autoreview Feishu budget rerun `pnpm test extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts`: OK, 2 files, 79 tests.
- Final post-autosquash Feishu rerun `pnpm test extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts`: OK, 5 files, 165 tests.
- Post-autosquash `pnpm test extensions/imessage/src/send.test.ts`: OK, 36 tests.
- Post-third-autoreview Telegram/core rerun `pnpm test extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/infra/outbound/delivery-queue.recovery.test.ts`: OK, 4 files, 40 tests.
- Final post-fourth-autoreview iMessage/Telegram/core rerun `pnpm test extensions/imessage/src/send.test.ts extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/infra/outbound/delivery-queue.recovery.test.ts`: OK, 5 files, 77 tests.
- Post-fifth-autoreview memory rerun `pnpm test src/memory-host-sdk/dreaming.test.ts extensions/memory-core/src/dreaming.test.ts`: OK, 2 files, 75 tests.
- Post-sixth-autoreview Feishu rerun `pnpm test extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts`: OK, 5 files, 166 tests.

### Changed gate

- `pnpm changed:lanes --json`: lanes `all` because `.agents/scripts/dream-cleanup-group-sessions.mjs` is unknown/fail-safe plus core/extensions/docs changes.
- First `pnpm check:changed`: remote Testbox delegation failed before checks because no `crabbox` binary was available on PATH.
- Local child fallback: `env OPENCLAW_CHECK_CHANGED_REMOTE_CHILD=1 OPENCLAW_CHANGED_LANES_RAW_SYNC=1 CI=1 PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm check:changed`: OK after the iMessage test lint fix.
- Final local child fallback after third-autoreview fixes: first retry hit missing local Playwright type resolution, `pnpm install --frozen-lockfile` reported dependencies already up to date, second retry passed typecheck/lint/import-cycles.
- Final local child fallback after fourth-autoreview fixes: passed typecheck/lint/import-cycles.
- Post-fifth-autoreview config checks `pnpm config:schema:check && pnpm config:channels:check && pnpm config:docs:check`: OK.
- Final local child fallback after sixth-autoreview fixes: passed typecheck/lint/import-cycles.

### Autoreview

- First run `.agents/skills/autoreview/scripts/autoreview --mode branch --base main --prompt ...`: found 3 actionable items.
- First-run accepted/fixed:
  - Feishu referenced-media downloads were appended after `inboundMedia` was snapshotted. Fix: build inbound media facts inside `buildCtxPayloadForAgent()` after quoted/root/thread media downloads have updated `mediaList`; added bot-level regression asserting quoted image `MediaPaths` reaches the agent context.
  - Feishu referenced-media downloads did not pass `maxBytes` into `downloadMessageResourceFeishu`. Fix: pass the configured cap through; added helper-level assertion.
  - Tracked local runbook/script examples exposed local account/group identifiers. Fix: redacted the Gmail account and group-id examples.
- Second run: found 2 actionable items.
- Second-run accepted/fixed:
  - Historical Feishu referenced-media downloads could each consume up to `mediaMaxBytes` and collectively exceed `historyMediaMaxMb`. Fix: cap each referenced download by the remaining history-media budget before download.
  - Older tracked runbooks still exposed private iMessage/person/bot examples. Fix: redacted private message text, sender/person details, bot handles, and operator-specific labels from the local runbook trail.
- Third run: found 2 actionable items.
- Third-run accepted/fixed:
  - Telegram `sendMessage` network errors were treated as definitely not sent. Fix: return unresolved for this state so durable recovery refuses blind replay unless Telegram-side proof exists.
  - Older tracked runbook/test material still exposed a concrete Telegram direct id and update ids. Fix: replaced them with placeholders and removed the real id from the recovery test.
- Fourth run: found 2 actionable items.
- Fourth-run accepted/fixed:
  - iMessage `send-attachment` hard-coded `--transport auto`, ignoring `channels.imessage.accounts.<id>.transport`. Fix: pass the resolved transport into the attachment helper; added a bridge-mode media test.
  - Older tracked runbook material still exposed a machine-local host and LAN IP. Fix: replaced them with placeholders.
- Fifth run: found 1 actionable item.
- Fifth-run accepted/fixed:
  - Memory Core `dreaming.excludeGroupIds` manifest/test fixtures used concrete-looking channel ids. Fix: replaced them with clearly synthetic group/direct/thread placeholders and reran config generation/checks.
- Sixth run: found 1 actionable item.
- Sixth-run accepted/fixed:
  - Feishu broadcast agents could resolve the same thread-history media concurrently and append duplicate media facts. Fix: added per-turn keyed promises plus serialized referenced-media side effects; added a parallel broadcast regression test.

### Build / runtime

- Final clean build after sixth-autoreview fixes: `trash dist dist-runtime && pnpm install --frozen-lockfile && pnpm build`: OK, total 97.8s.
- Dist self-check:
  - `dist-runtime/extensions/litellm/openclaw.plugin.json`: present
  - `dist/index.js`: 3293 bytes
  - `node --input-type=module -e 'await import("./dist/index.js")'`: OK
- `pnpm openclaw config validate`: OK.
- Gateway restart:
  - `pnpm openclaw gateway install --force --json`: OK, LaunchAgent loaded.
  - Final status after install: gateway version `2026.6.5`, RPC `2026.6.5`, PID `76991`, configAudit OK, no plugin version drift.
- `pnpm openclaw channels status --probe --channel imessage --json`: configured/running/probe OK, private API available, v2Ready true, `retractMessagePart` true, `eventLoop.degraded=false`.
- `pnpm openclaw models status --json`: default `openai/gpt-5.5`, fallbacks still resolve, OpenAI OAuth OK; xAI OAuth expiring in about 4.5h.

## Runtime migrations applied

`pnpm openclaw doctor` and `pnpm openclaw doctor --fix` applied current-version state migrations:

- ACPX gateway instance id -> plugin state.
- Memory Core daily/session/short-term/phase state -> SQLite plugin state across main/ivy/filomail/social workspaces; old JSON files renamed `.migrated`.
- Memory Wiki source-sync -> plugin state; old file renamed `.migrated`.
- Active auth profile JSON for main/email/ivy/social -> per-agent SQLite with `.sqlite-import.*.bak` backups; filomail auth JSON was left because no importable profile/state existed.
- Cron store normalized at `~/.openclaw/cron/jobs.json`.
- Plugin registry refreshed: 19/133 enabled plugins indexed.

Remaining doctor/security notices were informational or manual-policy items:

- 4 unreferenced legacy Codex OAuth sidecar files left in place.
- 663 orphan transcript files detected; not archived in this run.
- 33 cron jobs have explicit `payload.model` and will not inherit `agents.defaults.model`.
- Plaintext secret-bearing config fields and LAN gateway bind remain existing operator choices.

## 用户面 checklist

- 已运行: gateway `2026.6.5`.
- 已预热: iMessage channel probe OK.
- 已确认: model default/fallbacks still resolve; OpenAI usable.
- 需要用户后续处理: xAI OAuth 约 4.5h 后到期;如还要用 xAI,跑 `openclaw models auth login --provider xai`。
- 可选新增能力: Parallel search provider,仅在准备配置 `PARALLEL_API_KEY` 时建议启用。

## 下一轮注意

- 不要把 `main..patch/chris` 当审计输入；必须用目标 tag 做基线。
- SSRF / silent-reply 这类补丁不能只看 commit 标题,要核对本机真实配置和上游同功能路径。
- `pnpm check:changed` 本机远端委派依赖 `crabbox`;本轮 PATH 没有 crabbox,所以用 local child fallback 证明。
