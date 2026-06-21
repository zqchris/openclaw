# patch/chris v2026.6.9 升级记录

- Source tag: `v2026.6.8`
- Target tag: `v2026.6.9` (2026-06-21 上游 stable)
- 回滚锚点: `pre-upgrade-v2026.6.9` -> 旧 `patch/chris` (已 push 到 origin)
- fork/main: 已推到 `v2026.6.9^{}`
- patch/chris rebase 基线: `main` = `v2026.6.9`
- patch/chris post-rebase head before this record: `cc2fd4912d`

## 决定

升。当前运行版从 `2026.6.8 (63bf30f)` 升到 `2026.6.9 (cc2fd49)`。上游 `v2026.6.10-beta.1` 只是 beta,本轮不追。

## 新功能 / 上游收益

本轮 release notes 显示的主要收益:

- Richer Telegram delivery: 更丰富的 Telegram 输出、final delivery 和命令交互路径继续上游化。
- More dependable agent recovery: agent/session 恢复、取消/超时、命令后代进程清理更稳。
- Stronger Codex integration: Codex 运行时、工具协议、模型/会话恢复相关修复。
- Standalone official provider plugins: 官方 provider 插件继续外置化。
- More capable web/native clients: web/native 控制面和客户端交互修复。
- Search and skills: 搜索、skills 和上下文相关改进。

## 补丁审计结果

- `4adff66934 chore: regen config metadata for v2026.6.8`: drop,改为重新生成 6.9 metadata。
- `069e6b17ab fix(feishu): resolve quoted-message id to ctx.parentId after v2026.6.1 rebase`: drop/fold。核心 `ctx.parentId` 适配在 Feishu media conflict resolution 中已吸收。
- Keep/port:
  - live model switch caller default: 6.9 仍缺 caller-supplied run default 逻辑。
  - Feishu quoted/root/thread referenced media: 6.9 有 quoted text/current post media 改进,但没有把引用消息媒体下载进 `MediaPaths`。
  - Feishu 41050 sender-name negative cache: 6.9 只处理 `99991672`。
  - Telegram failed final delivery recovery: 6.9 有 generic ambiguous-send 基础,但没有 Telegram-specific reconciler / `lastError` context / fallback suppression。
  - Telegram `upload-file` / `read` action mapping: 6.9 未覆盖。
  - memory-core `excludeAgents` / `excludeGroupIds`: 6.9 未覆盖。
  - iMessage send transport: 6.9 已有 `sendTransport` schema/default,但 attachment path 仍需尊重 configured transport。
  - gateway channel auto-restart attempts stable-run reset: 6.9 未覆盖。

## Rebase / 修复

- Rebase 命令: `git rebase --onto main v2026.6.8 patch/chris`。
- live model switch test conflict:
  - 保留 caller-supplied default regression。
  - 丢弃旧上下文里的 `requestLiveSessionModelSwitch` test block;当前模块已无该 API。
- Feishu referenced media conflict:
  - 保留 6.9 提前 quoted fetch 的 empty-message guard 修复。
  - 在 referenced-media budget helper 定义后下载 quoted media,让 `buildInboundMedia()` 拿到引用媒体路径。
  - `fallbackMessageId` 使用 `ctx.parentId`。
  - root-vs-quoted 去重收窄为 root 与 quoted 同一条消息且 quoted media 已尝试下载时才跳过。
- Added:
  - `cc2fd4912d chore: regen config metadata for v2026.6.9`

## 本机配置迁移 / doctor

- `pnpm openclaw config validate`: OK。
- `pnpm openclaw doctor`: exit 0,只读完成。
- `pnpm openclaw doctor --fix`: OK。实际修改: `~/.openclaw/cron/jobs.json` 已 normalization。
- `pnpm openclaw config get plugins`: OK,输出只用于状态检查,不记录 secret-bearing config 原文。
- Doctor 剩余非阻断 warnings:
- filomail `models.json` custom model entry 缺 `apiKey`。
- xAI OAuth expiring in ~6h。
- legacy Telegram state / orphan transcripts 可迁移或归档。
- filomail 空 `auth-profiles.json` 保留,因为 doctor 没找到可 import 的 profile/state。
- 4 个 legacy Codex OAuth sidecar 保留,因为可能仍被 scan 外的 agent dir 引用。
- 1289 个 orphan transcript files 可归档,doctor 本轮只提示不自动归档。
- plaintext secret config / LAN bind policy warning 仍在。
- 初次 doctor 提示 gateway service plist still installed by `2026.6.8`;随后 `pnpm openclaw gateway install --force --json` 已更新 service metadata 到 `v2026.6.9`。

## 新功能默认状态 / 建议

| 功能 / 修复                                                          | 默认状态                                                                   | 对本机价值                                                                      | 建议                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| Telegram richer delivery / command output / HTML table normalization | Telegram plugin enabled                                                    | Telegram 输出、spool/final delivery 和命令交互路径更稳                          | 无需手动开启;观察真实消息即可   |
| Agent recovery / terminal outcome / session repair                   | 默认运行路径                                                               | timeout/cancel/compaction 后恢复更稳                                            | 无需操作                        |
| Codex integration / app-server teardown / tool approvals             | `codex` plugin enabled                                                     | Codex runtime 和 app-server 生命周期更稳                                        | 无需操作                        |
| Official provider plugins                                            | `openai`, `litellm`, `anthropic`, `xai` enabled; `amazon-bedrock` disabled | 已覆盖当前常用 provider;Bedrock 未用                                            | 不开启 Bedrock                  |
| Search providers                                                     | `tavily` enabled; `brave` disabled                                         | Tavily 可继续用;Brave 仍未启用                                                  | 暂不启用 Brave,除非要多搜索后端 |
| Memory / wiki / dreaming filters                                     | `memory-core`, `memory-wiki`, `active-memory` enabled                      | 本地 `excludeAgents` / `excludeGroupIds` 补丁继续生效;上游 dream 过滤修复可叠加 | 无需操作                        |
| Security / config hardening                                          | 默认 doctor/audit surfaces                                                 | 发现 plaintext secret、LAN bind、open Telegram group policy 等既有风险          | 单独排期迁移 secret refs        |

## 验证

- Generated/config:
  - `pnpm config:docs:gen`: OK,写入 `docs/.generated/config-baseline.sha256`。
  - `pnpm config:channels:gen`: OK,写入 `src/config/bundled-channel-config-metadata.generated.ts`。
  - `pnpm config:docs:check`: OK。
  - `pnpm config:channels:check`: OK。
- Targeted tests:
  - `node scripts/run-vitest.mjs src/agents/live-model-switch.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/send.test.ts extensions/imessage/src/send.test.ts extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel-actions.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/gateway/server-channels.test.ts src/memory-host-sdk/dreaming.test.ts`: OK,6 Vitest shards,335 tests.
  - `node scripts/run-vitest.mjs extensions/memory-core/src/dreaming-phases.test.ts extensions/memory-core/src/config.test.ts`: OK,1 Vitest shard,48 tests.
- Build/runtime:
  - `trash dist dist-runtime && pnpm build`: OK。
  - `dist-runtime/extensions/litellm/openclaw.plugin.json`: present。
  - `node --input-type=module -e 'await import("./dist/index.js")'`: OK。
  - `node -e 'console.log(require("./package.json").version)'`: `2026.6.9`。
- `pnpm openclaw config validate`: OK。
- `launchctl bootout gui/$(id -u)/ai.openclaw.gateway`: OK。
- First `launchctl bootstrap ...` returned `Bootstrap failed: 5`; service was not loaded and plist lint was OK. Immediate retry succeeded.
- Initial launchd restart: state `running`, PID `1937`, last exit code `(never exited)`。
- `openclaw --version`: `OpenClaw 2026.6.9 (cc2fd49)` before final runbook commit; `OpenClaw 2026.6.9 (51eeb48)` after runbook commit。
- gateway log: ready at `2026-06-21T19:23:05+08:00`; Feishu WebSocket ready; Telegram ingress started; iMessage provider started; provider/auth prewarm complete。
- `pnpm openclaw channels status --probe --channel imessage --json`: configured/running/probe OK; IMCore available; `retractMessagePart=true`; `sendRichSupportsAttachment=false`。
- `pnpm openclaw gateway status --json` after final runbook commit triggered a source checkout stale-dist rebuild (`git_head_changed`) because `HEAD` moved from the metadata commit to the runbook commit.
- `pnpm openclaw gateway install --force --json`: OK; updated LaunchAgent comment to `OpenClaw Gateway (v2026.6.9)` and restarted gateway.
- Final launchd: state `running`, PID `3446`, last exit code `(never exited)`。
- Final `pnpm openclaw gateway status --json`: RPC OK, gateway/server version `2026.6.9`, config valid, service `configAudit.ok=true`, plugin version drift empty。
- Final `pnpm openclaw channels status --probe --channel imessage --json`: configured/running/probe OK; event loop not degraded; IMCore available; `retractMessagePart=true`; `sendRichSupportsAttachment=false`。

## 用户面 checklist

- 已运行: gateway `2026.6.9`, PID `3446`; CLI/source HEAD `51eeb48`。
- 本轮没有发现可完整 drop 的 runtime patch;旧生成物和被吸收的 Feishu id shim 已退役。
- iMessage probe OK,事件循环未 degraded。
- `doctor --fix` 已补跑;cron store 已 normalization。
- 插件默认状态已检查: 21 个显式插件条目,18 个启用,3 个禁用。启用: `active-memory`, `anthropic`, `browser`, `codex`, `codex-supervisor`, `conversation-archive`, `elevenlabs`, `feishu`, `google`, `imessage`, `litellm`, `memory-core`, `memory-wiki`, `openai`, `tavily`, `telegram`, `workboard`, `xai`。禁用: `amazon-bedrock`, `brave`, `tokenjuice`。
- Obsidian upgrade note: `Agent/main/upgrades/2026-06-21.md`。
- Memory/dreaming 相关变更不会在 03:15 rsync 推残形态: schema/config validate OK,`memory-core` tests OK,本轮只保留 canonical config 过滤项和 doctor-normalized cron store。
- 本记录提交后会再做一次干净 build/restart,避免 runbook-only commit 造成 source-checkout dist hash drift。

## 下一轮注意

- 6.9 已部分覆盖 Telegram/Feishu 基础设施,但本地 referenced-media / final recovery 仍不是上游完整覆盖,不要误 drop。
- iMessage patch 的剩余价值只在 attachment send transport override;不要把旧 "default auto" 叙述当作仍需 port 的 schema 差异。
- 每次 rebase 后继续 drop 旧 `config metadata for v<previous>` commit,并重新跑 `pnpm config:docs:gen` + `pnpm config:channels:gen`。
