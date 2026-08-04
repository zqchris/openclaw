# patch/chris v2026.7.1-2 升级记录

- **Source tag**: v2026.7.1
- **Target tag**: v2026.7.1-2 (hotfix republish; package.json 版本仍为 2026.7.1,npm latest = 2026.7.1-2)
- **升级日期**: 2026-08-05
- **升级方式**: 自动模式 (Maker 定时任务)

## 新版功能导读

v2026.7.1-2 是 2026.7.1 train 的 hotfix 累积发布(9 commits),无新功能面:

**对 Chris 直接相关**:

- `fix(codex): continue turns after progress replies` — Codex 长 turn 在 progress 回复后不再中断,Chris 重度使用 Codex runtime,直接受益
- `fix(memory): recover derived sidecar conflicts` — memory 派生 sidecar 冲突自动恢复
- `fix(plugins): accept singleton npm view metadata` + `fix: recover managed npm lock metadata` — plugin 安装/更新元数据修复

**低相关**:

- `fix(state): tolerate guarded WSL EROFS chmod failures` — WSL 专属
- `feat(macos): refresh DMG installer artwork` — DMG 安装器美术
- `fix(release): keep reviewed migration residue nonfatal` — release 流程
- `fix(chat): keep proof decision out of actor closure` — chat 内部重构
- `docs: add 2026.7.1-1 release notes`

## 功能开关建议

无新功能开关;全部为缺陷修复,无需配置,默认生效。

## 更新收益

Codex turn continuation 修复与 memory sidecar 恢复直接改善本机日常使用;plugin npm 元数据修复降低未来插件更新失败概率。

## 保留 patch stack

### Keep (37 commits)

Code-affecting patches(同上轮,hotfix 无覆盖):

- fix(feishu): use saved resource helper for referenced media
- fix(feishu): download rich-text referenced media
- fix(feishu): silence and cache 41050 'no user authority' on sender-name lookup
- fix(feishu): pull attachments from quoted/root/thread history
- fix(agents): respect caller-supplied model in live session switch check

Docs/runbook/gate(归组,32 commits):历史升级 record、runbook 改进、post-upgrade gate 脚本。

### Drop (1 commit)

- `chore: regen config metadata for v2026.7.1` — generated metadata,本轮重新生成为 v2026.7.1-2 版本

## 冲突和生成物

- Rebase 无冲突(38 commits 全部干净应用;metadata commit 二次 interactive rebase drop)
- 重新生成: `config:docs:gen` + `config:channels:gen`,check 通过
- 无 schema 变更,未跑 `config:schema:gen`

## Build/restart/健康检查结果

- Build: 成功 (90.8s)
- `dist/index.js` import: OK
- `dist-runtime/extensions/litellm/openclaw.plugin.json`: present
- `openclaw config validate`: OK
- Gateway install --force: OK
- CLI: 2026.7.1 (6e1d7a0) — tag 内 package.json 即 2026.7.1,`-2` 仅为 npm publish 版本
- Gateway/RPC: 2026.7.1, running, config audit OK, drift none
- Health: OK, event loop not degraded
- iMessage: configured/running/probe 全 true

## 未跑的深度检查

- `openclaw doctor --lint --deep`(无 schema/migration 风险)
- 全量测试(无 runtime 代码冲突)

## Obsidian upgrade note

`~/Documents/ChrisData/Agent/main/upgrades/2026-08-05.md`

## local-ops references refresh

最终 HEAD 确定后刷新(见 gate)。
