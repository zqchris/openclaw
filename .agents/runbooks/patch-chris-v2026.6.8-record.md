# patch/chris v2026.6.8 升级记录

- Source tag: `v2026.6.6`
- Target tag: `v2026.6.8` (2026-06-16 上游 stable)
- 回滚锚点: `pre-upgrade-v2026.6.8` -> 旧 `patch/chris` (已 push 到 origin)
- fork/main: 已推到 `v2026.6.8^{}`
- patch/chris rebase 基线: `main` = `v2026.6.8`
- patch/chris post-rebase head before this record: `4adff66934`

## 决定

升。6.8 是正式 tag,本轮上游已合入 rich Telegram API/消息能力,可直接 drop 本地 rich Telegram cherry-pick 组。升级后本机 gateway 已运行 `2026.6.8`。

## 新功能 / 上游收益

本轮 release notes 和 `v2026.6.6..v2026.6.8` commit audit 显示的主要收益:

- Telegram rich message delivery 成为上游正式能力: rich text、tables/lists、final replies、CLI backend rich prompt handoff、line-break preservation、retired native draft migration。
- Agent/Gateway recovery: account-scoped DM send policy、generated media completions、auto-reply message-tool final replies、reset archive fallback reads、restart shutdown aborts、yielded subagent pause、heartbeat dedupe 等更稳。
- Providers/models: GLM-5.2、Claude Haiku 4.5 catalog、OpenRouter/Google Vertex provider-prefix normalization、OpenAI/Anthropic tool schema quarantine、OpenAI reasoning signature recovery、LM Studio thinking-off 修复。
- Usage hooks: native full footer renderer、default footer template、fixed decimal formatting、credential-aware limits 和 broken template warnings。
- UI/mobile: workspace files 可折叠且默认收起、WebChat backscroll streaming 保留、sidebar session picker 修复、iOS stale gateway reconnect。
- Memory/state/diagnostics: embedding batch 431 切分、QMD transient search、NFS SQLite WAL 避免、Memory Wiki raw source page 误报修复、full reindex rollback/cache recovery。
- Web search: key-free providers 保持 opt-in,避免无 API-backed provider 时自动选用。
- Dependencies: Hono 更新到 patched runtime。

## 补丁审计结果

- `f8c7dbacee chore: regen config metadata for v2026.6.6`: drop,改为重新生成 6.8 元数据。
- rich Telegram cherry-pick 组: drop,上游 6.8 已合入 same-or-better 行为。
  - `b41ce4a396 feat(telegram): send text as rich messages`
  - `0ceded9720 fix(telegram): keep rich text media-free`
  - `8f61c3cf5 feat(telegram): nudge agents toward rich text`
  - `2b70fef7db fix(telegram): clean rich message CI gates`
  - `8982526783 fix(telegram): allow rich tables in group prompts`
  - `a94481d9b1 fix(telegram): show rich text prompt for final replies`
  - `e93b4a3f63 fix(telegram): pass rich text prompts to cli backends` (上游 `45e36a241a` 覆盖同一能力)
- `6992de347a` / `0e179ef4f2` old boolean return follow-up: drop/fold。6.8 `processMessage` 已改为 `TelegramMessageProcessingResult`;本地 network-failure suppression port 成 `{ kind: "completed" }`。
- Keep/port: live model switch、Feishu quoted/root/thread attachment recovery、Feishu 41050 cache、Telegram final delivery unknown-send recovery、Telegram upload-file action mapping、iMessage auto send transport、memory-core dream filters、gateway auto-restart reset。

## Rebase / 修复

- Rebase 命令形态: interactive `git rebase --empty=drop --onto main v2026.6.6 patch/chris`,todo 中 drop 上述 retired commits。
- Telegram final delivery conflict:
  - 6.8 新增 spooled replay/result contract;本地 `sendMessage` network unknown suppression 改为返回 `{ kind: "completed" }`,避免 generic fallback 和 update replay。
  - 保留 `lastError` 传给 unknown-send reconciliation,Telegram `sendMessage` network unknown 标为 non-retryable unresolved。
- Telegram action conflict:
  - 保留 `upload-file` -> `sendMessage` 映射。
  - 适配 6.8 `TELEGRAM_TOOL_DELIVERY_ACTIONS`,把 `upload-file` 加入 delivery action set。
  - 保留 `read` action 明确 unsupported 说明。
- Added:
  - `4adff66934 chore: regen config metadata for v2026.6.8`

## 本机配置迁移

- `pnpm openclaw config validate` 首次失败: 本机 Telegram config 仍有旧键 `channels.telegram.accounts.default.streaming.preview.nativeToolProgress` / `nativeToolProgressAllowFrom`。
- `pnpm openclaw doctor --fix`: completed,移除旧 Telegram native draft keys;同时补建 Control UI assets、刷新 plugin registry、normalize cron store。
- 迁移后 `pnpm openclaw config validate`: OK。
- Doctor 剩余非阻断 warnings: filomail legacy auth JSON 无 importable profiles、4 个 legacy Codex OAuth sidecars 保留、xAI OAuth expiring、orphan transcript files、cron model overrides/isolated shell tool warnings、plaintext secret config / gateway LAN bind policy warning。

## 验证

- Generated/config:
  - `pnpm config:schema:check`: OK
  - `pnpm config:channels:check`: OK
  - `pnpm config:docs:check`: OK
- Targeted tests:
  - `pnpm test src/agents/live-model-switch.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel-actions.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/infra/outbound/delivery-queue.recovery.test.ts src/memory-host-sdk/dreaming.test.ts extensions/memory-core/src/dreaming.test.ts extensions/imessage/src/send.test.ts src/gateway/server-channels.test.ts`: OK, 8 Vitest shards, 430+ tests.
- Build/runtime:
  - `trash dist dist-runtime && pnpm build`: produced fresh `dist/` and `dist-runtime/`; tool session lost final summary after `tsdown`, so treated as untrusted until follow-up checks.
  - dist self-check import: OK.
  - `dist-runtime/extensions/litellm/openclaw.plugin.json`: present.
  - `pnpm openclaw config validate`: OK after doctor migration.
  - `pnpm openclaw gateway install --force --json`: OK.
  - `pnpm openclaw gateway status --deep --require-rpc --json`: running, PID `14265`, gateway/RPC `2026.6.8`, configAudit OK, plugin drift 0.
  - `pnpm openclaw health --json`: OK; event loop not degraded; Telegram/Feishu/iMessage running.
  - `pnpm openclaw channels status --probe --channel imessage --json`: configured/running/probe OK; IMCore available; `retractMessagePart=true`; `sendRichSupportsAttachment=false`.
  - `pnpm openclaw models status --json`: default `openai/gpt-5.5`; OpenAI OAuth OK; xAI OAuth expiring warning remains.
  - Service env proxy shape after install: no proxy keys present; no LiteLLM local-proxy bypass needed.

## 用户面 checklist

- 已运行: gateway `2026.6.8`.
- 本地 Telegram native draft preview keys 已迁移掉;rich Telegram delivery 现在走上游正式能力。
- iMessage probe 当前 OK,事件循环健康。
- xAI OAuth 仍为 expiring warning;要用 xAI 时再跑 `openclaw models auth login --provider xai`。
- 新的 key-free web search providers 仍是 opt-in;不用额外操作。

## 下一轮注意

- rich Telegram API 本地 cherry-pick 组已退役;不要再 rebase 回来。
- 6.8 以后 Telegram preview 旧键 `nativeToolProgress` / `nativeToolProgressAllowFrom` 无效;doctor 已迁移本机配置。
- `processMessage` 返回 `TelegramMessageProcessingResult`;旧 `return true` 类补丁不要恢复。
