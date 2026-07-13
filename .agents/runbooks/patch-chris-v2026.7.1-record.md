# patch/chris v2026.7.1 升级记录

- **Source tag**: v2026.7.1-beta.3
- **Target tag**: v2026.7.1
- **升级日期**: 2026-07-14
- **升级方式**: 自动模式 (Maker 定时任务)

## 新版功能导读

**对 Chris 直接相关的更新**:

- Telegram Codex 配对和 /steer /tell 控制 — 可以从 Telegram 操控 Codex 运行
- iMessage polls 原生支持
- Gateway TTS playback — 远端客户端可播放语音回复
- Container image 升级修复 — 状态迁移在 readiness 前运行，不再半升级
- Codex app-server 升 0.144.1 — native subagent mirroring 通过 tool_search 工作
- GPT-5.6 支持，新 setup 默认
- SecretRef 安全提升 — provider secrets 全程 sentinel 保护到最终网络边界
- 生成 session 标题（utilityModel routing）
- Plugin update 可靠性修复 — ClawHub 切换后不再被二次处理导致禁用
- Delivery recovery pacing — 启动后不再 burst 到 channel rate limits
- CJK Markdown emphasis 修复

**暂不涉及/只观察的**:

- Control UI sessions/sidebar/context ring — web 端，暂观察
- macOS native session browser — macOS app，暂观察
- iOS/Android offline/Watch — 移动端，暂观察
- Conversational onboarding (Crestodian) — 已完成 onboard，暂不触发
- ClawRouter — 无需配置，默认不启用
- Logbook work journal — disabled by default，暂不打开
- Featherless provider — 暂不使用
- Meta Muse Spark 1.1 — 暂不使用

## 功能开关建议

| 功能                               | 建议     | 配置入口                                             |
| ---------------------------------- | -------- | ---------------------------------------------------- |
| Telegram Codex /login /steer /tell | 按需使用 | 无需配置，随 Telegram channel 自动可用               |
| GPT-5.6 default                    | 只观察   | 无需配置，新 agent 默认生效；现有 agent 保持原 model |
| Session title generation           | 默认生效 | `agents.defaults.utilityModel` 可调路由              |
| Logbook work journal               | 暂不打开 | `plugins.entries.logbook.enabled: false` (default)   |
| ClawRouter                         | 暂不打开 | 需要单独配置凭证才生效                               |
| Gateway TTS                        | 按需使用 | 需配置 TTS provider                                  |

## 更新收益

Node 22.23.1 升级（从 22.22.1），满足 v2026.7.1 引擎要求。Codex runtime 0.144.1 带来 native subagent tool_search 支持。Plugin 更新不再丢失已成功切换的插件。Delivery recovery 不再 burst rate limits。

## 保留 patch stack

### Keep (35 commits)

Code-affecting patches:

- `90091b5363` fix(feishu): use saved resource helper for referenced media
- `692b743cab` fix(feishu): download rich-text referenced media
- `7a2fee3e61` fix(feishu): silence and cache 41050 'no user authority' on sender-name lookup
- `d385d912b1` fix(feishu): pull attachments from quoted/root/thread history
- `2e56bf4ed2` fix(agents): respect caller-supplied model in live session switch check

Docs/runbook/gate (grouped, 30 commits):

- All `docs(runbook): record v2026.*` history commits
- `docs(runbook): add auto mode for daily Maker-scheduled upgrades`
- `docs(runbook): ban npm -g on source install`
- `docs(runbook): require feature enable recommendations`
- `docs(runbook): require feature intro and kept patch stack`
- `docs(runbook): streamline patch/chris upgrade flow`
- `chore: enforce patch/chris post-upgrade gate`

### Drop (2 commits)

- `187e271e2a` docs(runbook): record v2026.7.1-beta.3 upgrade — old beta record, superseded by this record
- `35f20169f3` chore: regen config metadata for v2026.7.1-beta.3 — generated metadata, regenerated for v2026.7.1

## 冲突和生成物

- Rebase 冲突: 仅 `docs/.generated/config-baseline.sha256`（generated metadata commit），skip 后重新生成
- 重新生成: `config:docs:gen` + `config:channels:gen`，check 通过
- Node 升级: 22.22.1 → 22.23.1 (brew node@22 升级，符号链接重建)

## Build/restart/健康检查结果

- Build: 成功 (78.6s, tsdown 71.1s)
- `dist/index.js` import: OK
- `dist-runtime/extensions/litellm/openclaw.plugin.json`: present
- `openclaw config validate`: OK
- Gateway install --force: OK
- CLI version: 2026.7.1
- Gateway/RPC version: 2026.7.1
- Service: running (pid 92990)
- Config audit: OK
- Plugin drift: none
- Health: OK, event loop not degraded
- iMessage: configured=true, running=true, probe OK, v2Ready=true

## 未跑的深度检查

- `openclaw doctor --lint --deep` (非必需，无 schema migration 风险)
- 全量测试 (非必需，无 runtime 代码冲突)
- models status / channels status full (非必需)

## Obsidian upgrade note

`~/Documents/ChrisData/Agent/main/upgrades/2026-07-14.md`

## local-ops references refresh

已刷新: docs 699 pages, schema 9387 paths, 4 reference files regenerated.
