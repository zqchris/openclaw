# OpenClaw patch/chris 维护运行手册

本手册只服务 Chris 本机 `patch/chris` 源码安装。默认目标是快速、可回滚、尽快恢复 gateway，而不是发布级审计。

## 结论先行

- `检查更新` 先回答“新版更新了什么”，再说本机是否落后。
- `升级` 默认走轻量发布路径：rebase 本机 patch、build、重启、健康检查。
- 不做默认大备份。`origin/patch/chris`、reflog、release tag 已足够兜底；只有 config/schema/data migration 风险明确时才额外备份。
- 不把上游 `main` merge 进来。正式版只跟 release tag。
- 本机是源码安装,入口 `/Users/chris/.local/bin/openclaw`;禁止 `npm i -g openclaw@latest`,那会装出平行 npm 副本。`~/.openclaw/PATCHING.md` 是 npm 时代遗留文档,只作补丁历史参考。

## 本机布局

源码根通常是：

```bash
/Users/chris/Code/Github/openclaw/openclaw
```

运行入口：

```bash
/Users/chris/.local/bin/openclaw
```

实际运行的 LaunchAgent：

```bash
~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

重要分支：

- `main`: 本地 stable 基线，锁到正式 tag。
- `patch/chris`: Chris 本机补丁分支，基于正式 tag rebase。
- `origin`: `zqchris/openclaw` fork。
- `upstream`: `openclaw/openclaw` 官方仓库。

## 检查更新

用户说“检查更新 / 有没有新版本 / 最新版是什么”时，先讲 changelog。

```bash
git fetch upstream --tags
openclaw --version
npm view openclaw version dist-tags.latest --json
```

同时用 GitHub latest 确认正式版，避免 npm/fork/tag 缓存误判。

汇报顺序：

1. 最新正式版是什么，发布页核心更新是什么。
2. 本机当前运行版是什么，是否落后。
3. 跟 Chris 相关的更新点和建议。
4. 如果需要，才给升级路径。

不要先展开 rebase、备份、风险审计。

## 升级快路径

适用：本机自用 gateway、`patch/chris`、小版本 stable 更新、无明显数据迁移/安全/支付/外部凭证风险。

### 1. 定目标和当前状态

```bash
git fetch upstream --tags
git status --short --branch
git describe --tags --always --dirty
openclaw --version
openclaw gateway status --deep --require-rpc --json \
  | jq '{cli:.cli.version,gateway:.gateway.version,rpc:.rpc.version,service:.service.runtime.status,pid:.service.runtime.pid,drift:.pluginVersionDrift.drifts}'
```

目标 tag 必须是 GitHub latest / npm latest 对应的正式 tag，例如 `v2026.6.10`。

### 2. 读新版内容

```bash
git show v<TARGET>:CHANGELOG.md | sed -n '/^## <VERSION>/,/^## /p'
git log --oneline v<SOURCE>..v<TARGET> --max-count=80
```

输出给用户时优先解释“更新了什么”和“是否值得升”。

### 3. 轻量补丁审计

只审计 `patch/chris` 相对旧 source tag 的独有补丁。

```bash
SOURCE=v2026.6.9
TARGET=v2026.6.10
git log --oneline ${SOURCE}..patch/chris
```

默认规则：

- 旧版本 generated metadata commit 每轮 drop，升级后重新生成。
- 已被上游覆盖的补丁 drop。
- 仍解决本机真实问题的补丁 keep。
- 没有 runtime 冲突时，不写长表；记录 keep/drop 摘要即可。

如果要先预估冲突，用临时 worktree：

```bash
tmp=$(mktemp -d /tmp/openclaw-rebase-check.XXXXXX)
branch=tmp-upgrade-check-$(date +%s)
git worktree add -q -b "$branch" "$tmp" patch/chris
git -C "$tmp" rebase --onto "$TARGET" "$SOURCE"
git -C "$tmp" rebase --abort 2>/dev/null || true
git worktree remove -f "$tmp"
git branch -D "$branch"
```

### 4. 更新 main 到正式 tag

```bash
git checkout main
git reset --hard "$TARGET"
git push origin "${TARGET}^{}:refs/heads/main" --force-with-lease
```

禁止：

```bash
git pull upstream main
git merge upstream/main
gh api .../merge-upstream
```

### 5. Rebase patch/chris

```bash
git checkout patch/chris
git rebase --onto "$TARGET" "$SOURCE"
```

常见处理：

- generated metadata 冲突：优先跳过旧 generated commit，后面重新生成。
- 代码冲突：只解决真实冲突，跑对应窄测。
- rebase 后确认没有 conflict marker：

```bash
git diff --check
rg -n '<<<<<<<|=======|>>>>>>>' -- .
```

### 6. 生成物和验证

默认轻量验证：

```bash
pnpm config:docs:gen
pnpm config:channels:gen
pnpm config:docs:check
pnpm config:channels:check
```

有 schema 变更时再加：

```bash
pnpm config:schema:gen
pnpm config:schema:check
```

有 runtime 冲突时跑冲突相关测试。不要为了纯文档/生成物变更默认跑全量 CI。

### 7. Build

主 tree 的 `dist/` 必须跟下次 gateway 启动的代码一致。build 后不要长时间晾着老 gateway。

```bash
trash dist dist-runtime
pnpm build
ls dist-runtime/extensions/litellm/openclaw.plugin.json
node --input-type=module -e 'await import("./dist/index.js")'
pnpm openclaw config validate
```

除非依赖确实缺失，不默认 `pnpm install`。

### 8. 重启和轻量健康检查

build/import/config validate 通过后尽快重启：

```bash
openclaw gateway install --force --json
```

验证：

```bash
openclaw --version
openclaw gateway status --deep --require-rpc --json \
  | jq '{cli:.cli.version,gateway:.gateway.version,rpc:.rpc.version,service:.service.runtime.status,pid:.service.runtime.pid,configAudit:.service.configAudit.ok,drift:.pluginVersionDrift.drifts}'
openclaw health --json \
  | jq '{ok:.ok,version:.version,eventLoop:.eventLoop.degraded}'
openclaw channels status --probe --channel imessage --json \
  | jq '{configured:.configured,running:.running,probe:.probe.ok,eventLoop:.eventLoop.degraded}'
```

如果 `gateway install --force` 修改了 service env，复核 proxy 形状但不要打印 secret：

```bash
rg -n '^(export )?(http_proxy|https_proxy|all_proxy|no_proxy|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|OPENCLAW_PROXY_URL)=' ~/.openclaw/service-env/ai.openclaw.gateway.env
```

### 9. 记录和最终 dist 对齐

新增：

```bash
.agents/runbooks/patch-chris-v<TARGET>-record.md
~/Documents/ChrisData/Agent/main/upgrades/YYYY-MM-DD.md
```

记录必须短：

- source/target tag
- 新版功能 / 变化导读：先用 Chris 当前使用场景解释“升了能得到什么”，再列低相关的新功能。不要只写 upstream changelog 标题。
- 功能开关建议：必须明确列出 `建议现在打开` / `暂不打开` / `只观察或按需使用`。每项要写配置入口或说明“无需配置，默认生效”；不要擅自开启 channel、plugin、cron、memory/dreaming 或外部 API。
- 更新收益
- 实际保留 patch stack：至少列 code-affecting commit hash + subject；docs/runbook/generated 可以归组，但不能只写笼统“保留 Feishu 补丁”。
- keep/drop/port 摘要：drop 要说明是上游覆盖、低使用、已关闭、还是旧 workaround。
- 冲突和生成物
- build/restart/健康检查结果
- 未跑的深度检查
- Obsidian upgrade note 路径
- local-ops references refresh 结果

如果记录提交发生在 build 之后，`HEAD` 变了。再跑一次 `pnpm build` 或至少确认 `openclaw gateway status` 没触发 stale-dist rebuild；保险做法是记录提交后再最终 build/restart。

升级后刷新 Codex 本地运维索引：

```bash
/Users/chris/.agents/skills/openclaw-local-ops/scripts/refresh_refs.py
```

### 10. 推送

```bash
git push origin patch/chris --force-with-lease
git fetch origin
git log --oneline -1 origin/main
git log --oneline -1 origin/patch/chris
```

### 11. Post-upgrade gate

最后必须跑机器检查，不通过就不能汇报“完成”：

```bash
node .agents/scripts/patch-chris-post-upgrade-gate.mjs
```

这个 gate 会检查：

- runbook record 存在。
- Obsidian upgrade note 包含目标版本。
- `openclaw-local-ops` references 是最终 HEAD 之后刷新出来的。
- `dist/index.js` 可 import，`dist-runtime` 有 bundled plugin manifest。
- CLI / gateway / RPC 都是目标版本，gateway running，config audit OK，plugin drift 为空。
- health OK，iMessage configured/running/probe OK。
- `origin/main` 指向目标 tag，`origin/patch/chris` 等于本地 HEAD。

## 自动模式(Maker 定时任务)

Maker 侧有每日定时任务 `openclaw-auto-upgrade`,固定注入同一个汇报 session。无人值守时按本节执行,其余步骤与升级快路径完全一致。

自动判定:

- `git fetch upstream --tags` 后对比 GitHub/npm latest 正式 tag 与 `openclaw --version`。无新正式版 → 本轮静默跳过,只回一行现状,不做任何变更。
- 有新正式版 → 自主走完快路径 1–11:补丁按默认规则自行 keep/drop(generated metadata drop 重生成、上游覆盖 drop、仍修本机真实问题 keep),rebase、生成物、build、`openclaw gateway install --force` 重启、健康检查。
- 健康检查未过 → 先跑一次 `openclaw doctor --fix`(可能自动重启 gateway)再复检,复检仍失败按回滚处理。
- record 文件、Obsidian note、references 刷新、push `--force-with-lease`、post-upgrade gate 全部照常,gate 不过不许报"完成"。

自动回滚(以下任一即触发):rebase 出现无法高置信解决的运行时代码冲突;build/import/config validate 失败;gate 失败。动作:`git reset --hard` 回升级前 head(reflog 或 `origin/patch/chris`)→ 重 build → 重启 → 确认健康 → 在汇报 session 里明确报告失败原因和回滚结果。

自动模式边界:只做升级链路。config 优化、channel/secrets/cron 变更一律不碰;不合并 upstream/main;不新开 session。

## 什么时候升级验证强度

提高验证强度的条件：

- config schema 或 state migration 会改 `~/.openclaw`。
- 涉及 secrets、auth、支付、外部 API 凭证、安全边界。
- 发布给 Filo/SLG 等用户用，回滚成本高。
- rebase 出现 runtime 代码冲突。

这时再加：

```bash
openclaw doctor --lint --deep --json
openclaw models status --json
openclaw channels status --json
```

必要时跑 patch 相关测试或 `pnpm check:changed`。不要把这些变成本机小版本升级的默认起步动作。

## 快速回滚

代码回滚优先用 git：

```bash
git reflog patch/chris
git reset --hard <old-head>
trash dist dist-runtime && pnpm build
openclaw gateway install --force --json
```

如果 `origin/patch/chris` 还没推新 head，也可直接回到远端：

```bash
git reset --hard origin/patch/chris
```

只有本轮确实改坏 `~/.openclaw` 状态时，才考虑 daily backup 或手动状态恢复。不要默认创建 8GB tarball。

## 补丁管理

当前补丁清单以最新 `.agents/runbooks/patch-chris-v<TARGET>-record.md` 为准，不在主 runbook 里内嵌过期列表。

新增本机补丁：

```bash
git checkout -b fix/<name> patch/chris
# 修复、测试
git checkout patch/chris
git cherry-pick fix/<name>
```

简单修复也可以直接在 `patch/chris` 提交。

每轮升级继续注意：

- rich Telegram cherry-pick 组已在 6.8 退役，不要带回来。
- iMessage canonical key 是 `sendTransport`，不要恢复旧 `transport`。
- ACP/acpx runtime 已停用，除非用户明确要求，不要启用。
- 旧 generated metadata commit 每轮 drop，重新生成。

## 日常命令

重启 gateway：

```bash
openclaw gateway install --force --json
```

查看状态：

```bash
openclaw gateway status --deep --require-rpc --json
openclaw health --json
openclaw channels status --probe --channel imessage --json
```

日志：

```bash
tail -80 ~/.openclaw/logs/gateway.log
tail -80 ~/.openclaw/logs/gateway.err.log
```

遇到日志和当前 health 冲突时，当前 health/status 优先，日志只当历史证据。
