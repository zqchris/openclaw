# patch/chris v2026.6.6 升级记录

- Source tag: `v2026.6.5`
- Target tag: `v2026.6.6` (2026-06-12 上游 latest stable)
- 回滚锚点: `pre-upgrade-v2026.6.6` -> 旧 `patch/chris` (已 push 到 origin)
- fork/main: 已推到 `v2026.6.6^{}`
- patch/chris rebase 基线: `main` = `v2026.6.6`
- patch/chris old HEAD: `03b7b0cf0a`
- patch/chris post-rebase head before this record: `f8c7dbacee`

## 决定

升。6.6.6 是正式 tag,本轮上游带来 Control UI assets、gateway/auth/state、channel/provider/runtime 等当前本机可见收益。更新后本机 gateway 已运行 `2026.6.6`。

## 补丁审计结果

- 旧 6.5 生成物补丁 `a2cf2c0e48 chore: regen config metadata for v2026.6.5`: drop,改为重新生成 6.6.6 元数据。
- 其余 runtime patch 继续 keep: live model switch、Feishu 引用/历史附件、Feishu 41050 cache、Telegram final delivery/action/network-failure、iMessage auto transport、memory-core dream filters、gateway restart reset。
- iMessage rebase 冲突按 6.6.6 新 config contract 处理: 使用 `sendTransport`,不保留旧 `transport` schema。

## Rebase / 修复

- Rebase 命令形态: `git rebase --onto v2026.6.6 v2026.6.5 patch/chris`。
- iMessage conflict: 6.6.6 已把配置面改为 `sendTransport`;本地 attachment helper 改为继续尊重解析后的 transport。
- `a2cf2c0e48` 旧生成物 commit 在 rebase 中 skip/drop。
- 首轮 autoreview 发现 2 个 actionable item:
  - 6.6.6 生成元数据需要重新提交。
  - Feishu rich-text `post` 引用消息里 embedded image/media keys 没有被历史附件下载链路读取。
- 已新增:
  - `44885fedb3 fix(feishu): download rich-text referenced media`
  - `f8c7dbacee chore: regen config metadata for v2026.6.6`

## 本机配置迁移

- `pnpm openclaw config validate` 首次失败: 本机 iMessage config 仍有旧键 `channels.imessage.accounts.default.transport`。
- `pnpm openclaw doctor --fix` 未成功迁掉该键,因为 last-known-good restore 后仍是旧键。
- 已做最小本机迁移: 将该 account 的 `transport` 改名为 `sendTransport`,并保留 `openclaw.json.pre-v2026.6.6-sendTransport.*.bak` 备份。
- 迁移后 `pnpm openclaw config validate`: OK。

## 验证

- Feishu 窄测:
  - `pnpm test extensions/feishu/src/send.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts`: OK, 3 files, 103 tests.
- patch 相关定向测试:
  - `pnpm test src/agents/live-model-switch.test.ts extensions/feishu/src/bot-content.referenced-media.test.ts extensions/feishu/src/bot.test.ts extensions/feishu/src/bot-sender-name.test.ts extensions/feishu/src/channel.test.ts extensions/feishu/src/send.test.ts extensions/telegram/src/outbound-recovery.test.ts extensions/telegram/src/bot-message.test.ts extensions/telegram/src/channel-actions.test.ts extensions/telegram/src/channel.message-adapter.test.ts src/infra/outbound/delivery-queue.recovery.test.ts src/memory-host-sdk/dreaming.test.ts extensions/memory-core/src/dreaming.test.ts extensions/imessage/src/send.test.ts`: OK, 7 shards, 367 tests.
- Generated/config:
  - `pnpm config:schema:check`: OK
  - `pnpm config:channels:check`: OK
  - `pnpm config:docs:check`: OK
  - `git diff --check`: OK
  - changed-file conflict marker scan: no matches
- Build/runtime:
  - `trash dist dist-runtime && pnpm build`: OK
  - dist self-check import: OK
  - `pnpm openclaw config validate`: OK after iMessage config key migration
  - `pnpm openclaw gateway install --force --json`: OK
  - `pnpm openclaw gateway status --deep --json`: running, gateway/RPC `2026.6.6`, configAudit OK, no pluginVersionDrift
  - `pnpm openclaw channels status --probe --channel imessage --json`: configured/running/probe OK, private API available, eventLoop not degraded
  - `pnpm openclaw models status --json`: default `openai/gpt-5.5` resolves; xAI OAuth still reports expiring, same class of warning as before

## Autoreview note

- First branch autoreview completed and produced the two actionable items above; both were fixed.
- Follow-up branch autoreview was attempted after fixes, but its bundle was ~187k chars and did not return after 10 minutes; it was interrupted to avoid blocking the update. A narrower follow-up attempt also built a similarly large bundle and was interrupted after user escalation.
- Current proof is therefore targeted tests + generated checks + build/runtime probes + manual inspection of the two fixed findings, not a clean final autoreview pass.

## 用户面 checklist

- 已运行: gateway `2026.6.6`.
- 已修复: Control UI assets 已随 `pnpm build` 生成,之前的 "Control UI assets not found" 不应再出现。
- Dashboard 地址: `http://127.0.0.1:18789/`.
- 认证: 仍需要 gateway token/password;用 `pnpm openclaw dashboard --no-open` 获取本次连接用 token。
- xAI OAuth: 仍会报 expiring;不是本次升级阻断项。需要用 xAI 时再跑 `openclaw models auth login --provider xai`。

## 下一轮注意

- 6.6.6 以后 iMessage config canonical key 是 `sendTransport`;不要再恢复旧 `transport`。
- 生成物 commit 需要随目标 tag 重新生成;不要保留上一轮 `config-baseline` hash。
- Branch-wide autoreview 对这条 patch stack 会生成大 bundle,可能长时间不返回;下次应优先限制到新增 commits 或提前准备更小 dataset。
