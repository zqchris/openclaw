# patch/chris v2026.7.1-beta.3 升级记录

- Source tag: `v2026.6.11` (中途短暂停留 `v2026.7.1-beta.2`,同轮直接续跳 beta.3)
- Target tag: `v2026.7.1-beta.3` (`dcee1da876`)
- Previous local head: `dbe9cee50f`(升级前 patch/chris)
- Rebase base: `v2026.7.1-beta.3`
- **Beta 例外**:本轮偏离"只跟正式 tag"默认策略。Chris 明确要求启用 GPT-5.6(OAuth/ChatGPT 订阅),该支持只在 2026.7.1 beta 系列;beta.2 已发布但其 Codex harness 0.142.4/0.143.0 仍被 OpenAI 后端拒 5.6,故落位含 0.143.0 的 beta.3 tag(已打 tag,npm/GitHub 发布在途)。下一个正式版发布后应回归正式 tag 节奏。
- Backup: 无额外 tarball;`origin/patch/chris`、reflog、release tag 兜底。孤儿 Codex sidecar 归档在 `~/.openclaw/backup-codex-sidecars-20260710/`(2157 个文件,可回滚)。

## 结论

升,且这是一次"被 GPT-5.6 需求驱动"的 beta 升级。核心收益:

- **GPT-5.6 系列支持**(#98333):`gpt-5.6-sol/terra/luna`,372k context,新 thinking level 映射(含 `max`)、cache-write 计费、thinking metadata 保留。
- Codex app-server 管线升到 0.143.0 协议基线(本机另用 override 跑 0.144.0,见下)。
- Telegram/Gateway/Agent/Cron 大量稳定性修复(455 PR,详见 2026.7.1 changelog)。

升级后 `openai/gpt-5.6-sol` 已配为全局及 main/email/ivy/filomail/cron-bot 主模型,真实探针(codex harness、OAuth)回复正常。

## 新功能 / 变化导读

### 本机高相关

- **GPT-5.6(OAuth)**:本次升级动机。已实测 `gpt-5.6-sol` 走 ChatGPT 订阅 OAuth + codex harness 成功。
- **Codex sidecar → SQLite 迁移 + fail-closed 启动门**:beta.3 把 Codex 会话绑定从 `.jsonl.codex-app-server.json` sidecar 迁入 SQLite,且启动迁移有 warning 就拒绝就绪。本机 2157 个死会话孤儿 sidecar 触发崩溃循环(见"事故与修复")。
- **cron on-exit 调度 / session-targeted 分离**:本机大量 cron,后续可按需使用,无需现在改配置。
- **doctor 新增 auth-profile/workspace/channel-plugin 等 findings**:诊断面加强,默认生效。
- **Telegram 稳定性包**:progress 单窗口、reconnect 限流、poison update 死信等,主控制入口受益,默认生效。
- **usage footer**(#92657):聊天内 per-turn 用量,按需 `/usage full` 类指令,无需常驻配置。

### 本机低相关

- ClawRouter 内置 provider 插件、`openclaw attach` 外部 harness、iOS 26 视觉更新、iMessage 原生投票、Slack/Mattermost/WhatsApp/QQBot 修复、Control UI 改版:均不改本机当前工作流,不作为动机。

## 功能开关建议

### 建议现在打开

- 无(GPT-5.6 已按需求配置,不算"新功能开关")。

### 只观察或按需使用

- cron `on-exit` schedule:等有"命令退出唤醒 agent"的真实场景再用,无需预配置。
- usage footer / per-turn 用量:排查费用时按需。
- capability profiles(scoped conversations):观察,等正式版文档齐后再评估。

### 暂不打开

- ClawRouter:本机模型路由已由 openai+litellm 覆盖。
- `openclaw attach` 常驻工作流、Slack/Mattermost 相关:非本机路径。
- Memory/Dreaming:维持关闭。
- ACP/acpx:维持不启用。

## 实际保留 patch stack

Code-affecting(5 个全部 keep):

- `fix(feishu): use saved resource helper for referenced media`
- `fix(feishu): download rich-text referenced media`
- `fix(feishu): silence and cache 41050 'no user authority' on sender-name lookup`
- `fix(feishu): pull attachments from quoted/root/thread history`(本轮唯一真实冲突,见下)
- `fix(agents): respect caller-supplied model in live session switch check`

Operational/docs/generated:

- `chore: regen config metadata for v2026.7.1-beta.3`(新)
- `chore: enforce patch/chris post-upgrade gate` + 历代 runbook 记录(keep)

## keep/drop 摘要

- Drop:`chore: regen config metadata for v2026.6.11`(每轮 drop 重生成)。
- Keep:其余全部。上游 beta.3 的 Feishu 改动(streaming card flush、button command values、video duration)与本机 4 个 Feishu 补丁不重叠;"引用消息附件下载"仍为本机独有。

## 冲突与解决

`fix(feishu): pull attachments from quoted/root/thread history` 与 beta.3 重构冲突,2 文件:

- `bot-content.ts` parseMessageContent:取上游 `FEISHU_MEDIA_MESSAGE_TYPES`/`formatFeishuMediaContent`(功能覆盖旧内联逻辑,含 audio speech_to_text)。
- `bot.ts`:import 取并集;`resolveFeishuMediaList` 取上游新返回形状(`{media, unavailableCount}`);保留本机 deferred `buildInboundMedia()`(引用附件可后置追加),同时保留上游 `mediaFailureContent`/`commandFacingContent` 语义;上游急切 `inboundMedia` 变量丢弃(合并后无使用点)。

窄测:`bot-content.referenced-media.test.ts`(6)、`bot-sender-name.test.ts`(8)、`live-model-switch.test.ts`(22)全过。

## 事故与修复(本轮独有,重要)

1. **启动迁移 fail-closed 崩溃循环**:beta.3 首启后 gateway 反复 exit 1。原因:Codex sidecar → SQLite 迁移对"owner 无法解析"的 sidecar 留 warning,而新 preflight 对任何 warning 拒绝就绪。本机 2157 个孤儿 sidecar(email 1610、main 511+、social 24、其余少量;会话已被历史清理,binding 数据迁移已入库)。修复:全部归档至 `~/.openclaw/backup-codex-sidecars-20260710/` 后启动恢复。**上游可报 issue:老安装大量孤儿 sidecar 会被 fail-closed 门砖死 gateway,doctor --fix 也不清理。**
2. **launchd 卡 spawn scheduled**:多次 exit 1 后 launchd 停止拉起,`gateway install --force`/`kickstart` 无效;`bootout + bootstrap + kickstart -k` 恢复。
3. **codex-darwin-arm64 平台包陈旧**:`node_modules/@openai/codex` meta 包 0.143.0 但平台二进制目录残留 0.139.0(6 月 21 日),`pnpm install --frozen-lockfile/--force` 均报"Already up to date"不修(hoisted linker 状态误判)。修复:按 lockfile 精确版本+integrity(sha512 校验一致)从 npm 取 `@openai/codex@0.143.0-darwin-arm64` tarball 解包回位。
4. **OpenAI 后端 5.6 客户端门槛 > 0.143.0**:官方 codex CLI 0.143.0 + 本人 ChatGPT 登录直测同样 400("requires a newer version of Codex"),0.144.0(7/9 发布)直测通过。修复:`plugins.entries.codex.config.appServer.command` 指向 `~/.openclaw/tools/codex-app-server/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`(npm 安装的 0.144.0,协议 floor ≥0.143.0 兼容)。**上游 bump @openai/codex ≥0.144.0 后,下轮升级应删除此 override 回归 managed。**

## 模型配置变更(本轮附带需求)

- `agents.defaults.model.primary`:`openai/gpt-5.5` → `openai/gpt-5.6-sol`(fallback 链不变:opus-4-8, sonnet-4-6)。
- main/email/ivy/filomail/cron-bot 显式 primary 同步换成 `openai/gpt-5.6-sol`;social 保持 `litellm/z-ai/glm-5.2`。
- 新模型条目继承 5.5 形状:`alias gpt`、`params.textVerbosity low`、`agentRuntime codex`;旧 5.5 条目改 `alias gpt55` 留作快速切回。
- 真实探针:`openclaw agent --session-key probe-gpt56-v4` → `provider openai / model gpt-5.6-sol / harness codex`,无 fallback。

## Build / 重启 / 健康

- `pnpm install --frozen-lockfile`(4m51s,codex 0.143.0 等依赖同步)。
- regen:config-baseline.sha256、bundled-channel-config-metadata(已提交);schema 为 runtime-computed,check OK。
- `pnpm build` OK;dist import OK;litellm manifest 存在;`config validate` OK。
- gateway/RPC/CLI = 2026.7.1-beta.3;service running;configAudit OK;drift 空。
- health OK;iMessage configured/running/probe OK;event loop 正常。
- doctor --lint --deep:ok=false 仅长期存在的 security warnings(config 明文密钥、LAN bind),非本轮回归。
- xai OAuth 过期为升级前既有状态,未处理(与本轮无关)。

## 未跑的深度检查

全量 CI、广域 channel 套件、Crabbox/Testbox、移动端 QA、Slack/Mattermost/WhatsApp 功能测试。

## 其他

- Obsidian note: `~/Documents/ChrisData/Agent/main/upgrades/2026-07-10.md`
- local-ops references: 升级后已刷新(见 gate)。
