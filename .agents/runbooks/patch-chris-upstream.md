# OpenClaw 维护运行手册

## 架构概览

```
~/Github/openclaw/          ← 源码 + dist/（build 产物，gateway 运行入口）
  ├── dist/index.js         ← gateway 启动入口
  ├── extensions/           ← 插件源码
  ├── patch/chris           ← 本地补丁分支（基于正式 tag）
  └── main                  ← 锁定在正式 release tag（不跟 upstream dev）

~/.openclaw/                ← 用户数据/运行状态（真实目录，非 symlink）
  ├── openclaw.json         ← 主配置
  ├── agents/               ← agent sessions/日志
  ├── workspace/            ← 主 workspace（MEMORY.md, skills, scripts）
  ├── workspace-social/     ← 葫芦社交 agent
  ├── workspace-email/      ← 邮件 agent
  ├── workspace-ivy/        ← Ivy agent
  ├── memory/               ← memory SQLite + LanceDB
  ├── cron/                 ← 定时任务配置
  ├── credentials/          ← OAuth/auth tokens
  ├── identity/             ← device identity
  └── logs/                 ← gateway 日志

~/Library/LaunchAgents/ai.openclaw.gateway.plist  ← launchd 服务定义
```

注：路径示例是 Mac mini 上的布局。主开发机的源码根可能在 `~/Code/Github/openclaw/openclaw/`。所有命令都假设当前 cwd 在源码根，跨机使用时自行替换。

## 日常操作

### 重启 Gateway

```bash
launchctl kickstart -k "gui/$(id -u)/ai.openclaw.gateway"
```

**禁止**：前台 `openclaw gateway run`、`nohup` 方式启动

### 查看状态

```bash
pnpm openclaw status --deep      # 全面状态
pnpm openclaw channels status    # 频道状态
pnpm openclaw memory status      # 记忆状态
pnpm openclaw wiki status        # wiki 状态
```

### 查看日志

```bash
tail -f ~/.openclaw/logs/gateway.log       # 主日志
tail -f ~/.openclaw/logs/gateway.err.log   # 错误日志
./scripts/clawlog.sh                       # macOS 统一日志
```

## Git 分支模型

```
upstream/main (openclaw/openclaw)     <- 上游 dev（不直接用！）
  |
  +-- v2026.4.8 (tag)                <- 正式发布版
  |
local main ---------------------------  锁定在正式 tag
  |
  +-- patch/chris --------------------  本地补丁（rebase on main）
        |
        +-- fix/xxx ------------------  临时修复分支（完成后 cherry-pick 到 patch/chris）

origin (zqchris/openclaw)             <- GitHub fork
  +-- main                            <- 同步 local main（= 正式 tag）
  +-- patch/chris                     <- 同步 local patch/chris
```

**关键原则**：

- `main` 永远锁 tag，不跟 upstream dev
- 所有改动在 `patch/chris` 上
- 临时修复用 `fix/xxx` 分支，完成后 cherry-pick 到 `patch/chris`
- 每次升级/改动后都 push `origin/patch/chris`
- `origin/main` 也要同步（CI workflow 会用）

## 检查更新（只读，不动任何东西）

用户说"检查更新""有没有新版本""最新版是多少"时走这个：

```bash
# 1. 必须 fetch upstream tags（绝不能只看本地 tag 或 fork main）
git fetch upstream --tags
# 2. 看上游最新正式 release
gh release list --repo openclaw/openclaw --limit 5
# 3. 当前运行版本
openclaw --version
```

汇报必须包含：

1. **当前运行版本** vs **最新正式版**（明确说两个版本号）
2. **当前版本到最新版之间的 changelog**（不是更早版本之间的！）：
   - `git show v<latest>:CHANGELOG.md` 读从当前版本到最新版之间的所有版本段落
3. **跟用户相关的新功能/修复清单**，格式：
   > | 功能/修复 | 跟你相关度 | 说明 | 建议 |
   > | --------- | ---------- | ---- | ---- |
4. 问用户要不要升

⛔ **绝对禁止**：`git pull upstream main` / `git merge upstream/main` / `gh api merge-upstream`。

---

## 升级流程

**核心原则：agent 不主动停/重启 gateway。** Gateway 是 Node 进程，启动时把 dist 加载进内存，运行期间**不再读 dist 文件**——所以改代码 / build / 覆盖 dist **不影响内存里跑的 gateway**。重启时机由 user 决定（user 可能正跑别的 agent / 群聊 reply / cron 工作，重启会切断）。

### ⚠️ dist 一致性规则

**主 tree 的 `dist/` 应该跟"下次 gateway 重启时要加载的代码"一致。** 内存里跑的老 gateway 不受 dist 改动影响，但下次 user 重启 gateway 会读 dist——所以 build 完后 dist 要是正确的目标版本。

不允许的操作:

- ❌ 主 tree 切到其它分支后 `pnpm build`(下次 gateway 重启会加载错分支的代码)
- ❌ 增量 build 崩掉后 dist 半残留(stub 指向缺失的 hashed bundle，下次重启 ERR_MODULE_NOT_FOUND)
- ❌ 做 PR fix 验证直接在主 tree `trash dist && pnpm build`(污染 dist，跟 patch/chris 不一致)

**合规做法**:

1. **PR 验证用 worktree 隔离**(避免主 tree dist 被污染):
   ```bash
   git worktree add .claude/worktrees/pr-<name> <pr-branch>
   cd .claude/worktrees/pr-<name>
   pnpm install --frozen-lockfile && trash dist && pnpm build
   # 做完
   cd ~/Github/openclaw && git worktree remove .claude/worktrees/pr-<name>
   ```
2. **主 tree 升级/cherry-pick 后 build**: 直接 `trash dist && pnpm build`，**不停 gateway**。注意 build 期间不要改 config / enable plugin（避免 gateway dynamic import 撞上半残 dist）。Build 完成 + step 5.5 自检 → 报告 user，由 user 决定何时重启 gateway。

### 1. 准备（只读 + 备份，不碰运行环境）

```bash
# 确认当前版本和分支
git describe --tags --abbrev=0 main
git log --oneline -3 patch/chris

# 升级前快照（config/credentials/sessions/workspaces）+ 立即校验
# 升级是「人工触发的高风险窗口」，独立做一次带 --verify 的快照
pnpm openclaw backup create --verify --output ~/Backups
```

备份只读 `~/.openclaw`，不动 gateway。如果升级中途出问题，可以 `openclaw backup verify <archive>` 校验后手动恢复。

日常已有 `zqchris/openclaw-backup` 每天 04:00 cron 在跑（覆盖 `~/.openclaw` 状态），升级当口的手动快照是额外保险。

跨端笔记走 Obsidian vault（`~/Documents/ChrisData/Agent/*`），不再写 `zqchris/aidev` `CURRENT_STATE.md`。

### 2. 检查上游新 tag（只读）

```bash
git fetch upstream --tags
echo "当前: $(git describe --tags --abbrev=0 main)"
echo "最新: $(git tag -l 'v2026.*' | sort -V | tail -1)"
```

### 2.5. 评估变更（只读，决定要不要升）

```bash
# 读 CHANGELOG 新版本段落
head -200 CHANGELOG.md

# 或者直接看两个 tag 之间的 commit
git log --oneline v2026.4.9..v2026.4.10

# 看 diff 影响面（尤其是 patch/chris 触碰的文件）
git diff --stat v2026.4.9..v2026.4.10
```

评估要点：破坏性变更？patch/chris 会不会冲突？新功能是否值得升？
**这一步决定是否继续**。如果不升，流程到此结束，运行环境完全没动过。

### 2.6. 补丁审计（只读，**绝不能省略**）

对 patch/chris 上所有独有补丁做「上游覆盖度」审计，能 drop 的立刻 drop。

```bash
# 用候选目标 tag 做基线（不要用本地 main）
TARGET=v2026.5.14   # 替换为本轮候选 tag
git log --oneline ${TARGET}..patch/chris
```

⚠️ 不要用 `git log --oneline main..patch/chris`。本地 `main` 可能还停在前一个 release tag，而 `patch/chris` 已经 rebase 到更新的目标 —— 这样会把整段上游 commit 也算进审计列表（实测会出现 6000+ 行）。

**逐个** 做下面这张表，给 Chris 决策：

| 补丁       | 目的     | 上游现状 (v<new>)  | 官方配置替代 | 结论                         |
| ---------- | -------- | ------------------ | ------------ | ---------------------------- |
| hash + msg | 解决什么 | 已合入/已改进/未动 | 有/无        | drop / 保留 / 拆分保留一部分 |

每个补丁的审计流程：

1. `git show <commit>` 看完整 diff，理解补丁意图
2. `git show v<new>:<file>` 看上游当前文件状态
3. 搜 `git show v<new>:CHANGELOG.md`、`schema.help.ts`、docs/ 是否有官方 config
4. 形成结论：drop / 保留 / 拆分

**Chris 拍板后才能开始 rebase**。rebase 时主动 drop 被退役的补丁。

**绝不允许**：「直接 rebase，冲突再说」。这就是过去 patch 堆到 20+ 的根因。

### 3. 同步 tag 到 fork + 更新 local main（开始动 git，gateway 不受影响）

#### ⛔ 绝对禁止（会把上游数百个 dev commit 拉进来）

```
git pull upstream main          # ❌ 禁止
git merge upstream/main         # ❌ 禁止
gh api .../merge-upstream       # ❌ 禁止（GitHub fork sync API，同步的是 branch 不是 tag）
```

upstream main 有大量未发布 dev 代码，**只能用 tag，不能碰 upstream main branch**。

#### ✅ 正确做法：只用 tag 指针

```bash
# 1. 推送新 tag 到自己的 fork（让 fork 也有这个 tag）
git push origin v2026.4.10    # 替换为实际 tag

# 2. 更新 local main 到新 tag
git checkout main
git reset --hard v2026.4.10

# 3. 把 fork 的 main 指向 tag（不是 upstream main！）
git push origin "v2026.4.10^{}:refs/heads/main" --force-with-lease
```

**原理**：`v2026.4.10^{}` 解引用到 tag 指向的 commit，只推那一个点，不带任何 dev 代码。

### 4. Rebase 补丁

```bash
git checkout patch/chris
git rebase main
```

逐个解决冲突。每个补丁检查：

- 是否已被上游合并？-> drop
- 是否仍然需要？-> 保留并适配

### 5. Build + 验证（**不停 gateway**）

Gateway 跑期间 build 是安全的——内存里的 gateway 不读 dist 文件，build 覆盖 dist 不影响它。Build 完成后 dist 是新版本，等 user 重启时才会被加载。

⚠️ **build 期间避免**：不要触发 plugin 动态加载 / config 改动 / `pnpm openclaw ...` 命令——这些可能让 gateway 临时 dynamic import dist 文件，撞上半残的 build 中间状态。

**兜底**：step 5.5 的 import 自检（`node --input-type=module -e 'await import("./dist/index.js")'`）不管什么原因 dist 半残都能 catch。失败就 `trash dist && pnpm build` 重做一遍。

```bash
# 不停 gateway —— gateway 内存版不受 dist 改动影响

# 干净 build —— trash 必须紧贴 build，中间不要触发 dist 写入
trash dist dist-runtime                 # 两个一起清，避免老 stage 残留
pnpm install --frozen-lockfile
pnpm build                              # tsdown + runtime-postbuild（含 stage dist-runtime）
pnpm check                              # lint/format/typecheck
pnpm test src/path/to/changed.test.ts   # 相关测试

# Schema 校验（不启动 gateway，纯静态检查 openclaw.json 是否符合新版 schema）
# 如果新版改了 config schema，这里能在 5.5 启动自检之前提前 catch 配置问题
pnpm openclaw config validate

# 变更门禁（根 AGENTS.md / CLAUDE.md 要求）
pnpm check:changed --base upstream/main
# Testbox 跑不通时记录本地降级模式（哪些 lane 没跑、为什么）
```

⚠️ 一个 worktree 里**不要同时跑两个独立的 `pnpm test`**，Vitest 缓存会撞 `ENOTEMPTY`。要并发的话用 `OPENCLAW_VITEST_FS_MODULE_CACHE_PATH` 隔离。

### 5.5. Build 一致性自检（v2026.4.25+ 必做，跳过 = gateway 起不来）

**真正踩过的坑**：升级 v2026.4.25 时，`pnpm openclaw --version` 在 trash dist 之前触发了一次失败 build，污染了 dist。后续 `trash dist && pnpm build` 流程跑完后 dist 看起来正常，但启动 gateway 仍然 `ERR_MODULE_NOT_FOUND: dist/defaults-Bnf56S7k.js`，因为 dist 累积了多个 hash 的 chunk（`tsdown` 的 clean step 不全清 dist），`dist/index.js` stub import 的 hash 跟实际写出的 chunk 不匹配。

**症状识别**：

- gateway.err.log 出现 `ERR_MODULE_NOT_FOUND: dist/<base>-<hash>.js`（fatal）
- 紧接着可能还有大量 `plugin manifest not found: dist-runtime/extensions/<id>/openclaw.plugin.json` —— 这是**次要副作用**，不是根因；gateway 早就在 module resolve 阶段 fatal 了，根本没进入 plugin loading
- `~/.openclaw/logs/stability/openclaw-stability-*-gateway.startup_failed.json` 写出
- launchd 反复 keepalive 重启 → throttle

**自检（必须在 bootstrap 之前跑）**：

```bash
# 1. dist-runtime 已被 runtime-postbuild stage（应该 build 时自动产生）
ls dist-runtime/extensions/litellm/openclaw.plugin.json >/dev/null 2>&1 \
  && echo "✅ dist-runtime stage 完整" \
  || echo "❌ dist-runtime 缺 — 跑 node scripts/stage-bundled-plugin-runtime.mjs 补"

# 2. dist/index.js 是 stub loader（v2026.4.25 stub 约 2.7-2.9 KB；不是巨大 bundle）
[ -f dist/index.js ] && echo "✅ dist/index.js 存在 ($(stat -f '%z' dist/index.js) bytes)"

# 3. 真正抓"chunk 引用错配"（ERR_MODULE_NOT_FOUND）的方法：startup smoke
#    无法用静态文件名计数判断 — tsdown 会为不同源模块生成同 base name 不同 hash 的多个 chunk，
#    比如 dist/defaults-*.js 有 5 个分别属于 src/agents/defaults.ts、extensions/sglang/defaults.ts 等，是预期产物。
#    真正能判定的是 dist/index.js 的 import 链能否完整解析：
node --input-type=module -e 'await import("./dist/index.js").catch(e => { console.error("❌ dist 启动 import 失败:", e.message); process.exit(1) }); console.log("✅ dist 启动 import 通")' 2>&1 | tail -3
```

**判定逻辑**：

- 真正会让 gateway 启动失败 `ERR_MODULE_NOT_FOUND: dist/<base>-<hash>.js` 的，是 build 流程被打断（lock 冲突、ENOTEMPTY、`pnpm openclaw ...` 在中间触发了一次失败 build）导致 `dist/index.js` 引用某 chunk hash，但该 hash 文件没写出来。
- 静态计数 `ls dist/<base>-*.js | wc -l` 不能区分"多模块同 base name（正常）" vs "失败 build 残留（异常）"，**已废，不要再用**。
- 用一次实际 import 探测最直接：能 import 通就启动得来；import 失败立刻报具体缺哪个 chunk hash。

**修复**：

```bash
trash dist dist-runtime
pnpm build    # 重新干净 build
# 自检通过后再 bootstrap
```

**dist-runtime 缺失修复**（chunk 一致但 dist-runtime 没 stage 出来时）：

```bash
# 直接补 stage
node scripts/stage-bundled-plugin-runtime.mjs

# 或者重做一遍干净 build
trash dist dist-runtime && pnpm build
```

⛔ **不要用 `pnpm openclaw doctor --fix` 修这个**。这台机上 `doctor --fix` 会把刻意配的 pi + openai-codex/gpt-5.5 多 provider fallback 链强迁掉，副作用大于收益。

`runtime-postbuild` 步骤在 `pnpm build` 流程里（`scripts/build-all.mjs` BUILD_ALL_STEPS），调用 `stageBundledPluginRuntime()`，把 `dist/extensions/<id>/` 的 manifest + 入口 stage 到 `dist-runtime/extensions/<id>/`，并 symlink node_modules。**正常情况 build 完就有 dist-runtime**，只有 build 流程被打断（lock 冲突、ENOTEMPTY 等）才会缺。

### Bundled plugin runtime deps lazy stage（v2026.4.25 已不需要预热）

`trash dist && pnpm build` 后 `dist/extensions/<id>/node_modules` 全空（plugin-local deps 不在 build 产出）。但**v2026.4.25 起 gateway 启动时会自动为所有 enabled plugin 把 deps stage 完**，不需要任何主动预热。

**实测 v2026.4.25 启动 timeline**（升级后第一次重启的 gateway.log）：

```
[gateway] starting...
[plugins] browser staging bundled runtime deps (7 missing): playwright-core, ws, ...
[plugins] browser installed bundled runtime deps in 10249ms
[plugins] memory-wiki staging bundled runtime deps (2 missing): typebox, yaml
[plugins] memory-wiki installed bundled runtime deps in 1906ms
[gateway] starting HTTP server...
```

**第一次启动多花 ~10s**（browser 装 playwright-core 等大件最长），属于不可避免的 startup overhead；后续启动 deps 已存在不再 stage。

历史认知（v2026.4.24 时代）："发消息触发 lazy stage" — 已废，v2026.4.25 改成 startup 时自动跑，发不发消息一样。

需要自检 deps 状态时：

```bash
# 查哪些 enabled plugin 还没 stage（理论上 startup 后就该齐）
for d in dist/extensions/*/; do
  pkg="${d%/}"; pkg="${pkg##*/}"
  [ ! -d "$d/node_modules" ] && [ -f "$d/package.json" ] \
    && grep -q '"dependencies"' "$d/package.json" 2>/dev/null \
    && echo "no-deps: $pkg"
done
```

disabled plugin 没 stage 是正常的，启用时再装。

### 6. 新功能部署（必做，不能跳过）

升级后 agent **必须主动**完成以下流程，不等用户问：

**a) 读 changelog，提取跟用户相关的新功能**

```bash
# 对比旧版和新版之间的 changelog 段落
# 例如从 v2026.4.8 升到 v2026.4.9，读 ## 2026.4.9 段落
head -200 CHANGELOG.md
```

**b) 检查新功能的默认启用状态（只读）**

```bash
pnpm openclaw doctor              # 配置健康 + 迁移提示，只读看输出
pnpm openclaw config get plugins  # 检查新插件是否已注册但未启用
```

⛔ **不要跑 `pnpm openclaw doctor --fix`**。这台机上 doctor --fix 会强迁 pi + openai-codex/gpt-5.5 多 provider fallback 配置，把刻意配的多 provider 链条平掉。具体迁移项用 `config set` 一条一条单点改。

**c) 向用户汇报新功能清单，格式如下**：

> 本次升级新增了以下跟你相关的功能：
>
> | 功能                | 默认状态 | 对你的好处                            | 建议     |
> | ------------------- | -------- | ------------------------------------- | -------- |
> | Memory Wiki         | 未启用   | agent 可以结构化整理跨 session 知识   | 建议开启 |
> | Session checkpoints | 默认开启 | 可以回溯 compaction 前的 session 状态 | 无需操作 |
> | ...                 | ...      | ...                                   | ...      |
>
> 要开启哪些？

**d) 用户确认后逐个启用并验证**

```bash
pnpm openclaw config set plugins.entries.xxx.enabled true
pnpm openclaw config set xxx.yyy value
# 每个功能启用后立即验证
pnpm openclaw xxx status
```

**重要**：不要只说"兼容"就跳过。新功能如果对用户有价值，必须主动推荐。

### 7. 报告 user，等 user 重启（agent 不主动重启）

**Build + 自检完成后停下**，向 user 汇报：

> Build done, dist OK（step 5.5 import 自检通过）。Gateway 重启时机你定（你可能正跑别的 agent / 群聊 reply / cron 工作，重启会切断 inflight session）。
> 重启命令：
>
> ```bash
> launchctl bootout gui/$(id -u)/ai.openclaw.gateway
> launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
> ```
>
> 你重启后告诉我，我来核对版本。

**user 重启后**，agent 做版本验证：

```bash
sleep 10
launchctl print gui/$(id -u)/ai.openclaw.gateway | grep -E 'state|pid'
EXPECTED=$(git describe --tags --abbrev=0 main)
echo "期望版本: $EXPECTED"
node -e 'console.log(require("./package.json").version)'  # 不触发 build
tail -50 ~/.openclaw/logs/gateway.log | grep -iE 'start|version|boot|ready'
pnpm openclaw doctor   # 只读

# 频道验证（5.12+ 主消息面是 iMessage；BlueBubbles 已被上游删除）
pnpm openclaw channels status --probe --channel imessage --json
# 关注：configured/running、probe ok、private API ready、
# editMessage / retractMessagePart / sendRichSupportsAttachment 这些能力位
```

**版本不符怎么办（user 排查思路）：**

1. 确认 `dist/` 是新 build 的（`ls -la dist/index.js` 时间戳）
2. 完全 `launchctl bootout` 后再 bootstrap（避免 kickstart 复用老进程）
3. 检查残留进程：`ps aux | grep openclaw-gateway`
4. 检查 plist 里的 `ProgramArguments` 指向当前 repo dist/

**版本验证后向 user 汇报**：

> gateway 已重启，运行版本核对为 vX.X.X（期望 vX.X.X），PID=xxxxx

### 8. 推送 + 同步

```bash
# 推送补丁分支到 fork
git push origin patch/chris --force-with-lease

# 确认 fork 上两个关键 ref 都正确
echo "origin/main: $(git log --oneline -1 origin/main)"
echo "origin/patch/chris: $(git log --oneline -1 origin/patch/chris)"

# 在 .agents/runbooks/ 新增本轮版本记录：patch-chris-v<target>-record.md
# （source/target tag、备份 tag、补丁 keep/drop/port 清单、验证证据、用户面 checklist）
```

⚠️ 升级若动到 agent persona 或 memory schema，确认下一次凌晨 3:15 的 Obsidian vault rsync 不会把残形态推到联邦层。

跨端升级笔记写在 Obsidian vault：`~/Documents/ChrisData/Agent/main/upgrades/<date>.md`（取代旧的 `zqchris/aidev/CURRENT_STATE.md` 路径，aidev 已退役）。

## 补丁管理

### 当前补丁清单

**当前补丁清单见 `.agents/runbooks/patch-chris-v<最新>-record.md`**（如 `patch-chris-v2026.5.12-record.md`）。每轮升级落在那个版本记录里：source/target tag、补丁 keep/drop/port 清单、验证证据、用户面 checklist。runbook 不再内嵌过期的补丁列表。

BlueBubbles 在 v2026.5.12 已被上游删除，主消息面切到 iMessage（`extensions/imessage`，外加 `imsg` CLI + Mac mini SSH 中继）。iMessage 频道配置面要点：

- `channels.imessage.cliPath` 指向 SSH 包装（远端跑 `/opt/homebrew/bin/imsg`；非交互 ssh 没 Homebrew PATH，要手动写）
- `channels.imessage.remoteHost` 用来 SCP 远端附件
- `channels.imessage.groupPolicy=allowlist` 时 `channels.imessage.groups` 是兜底要件，删了群消息会被静默丢
- `channels.imessage.catchup` 用于重启后补拉漏消息

iMessage 切换的完整笔记见 `.agents/runbooks/patch-chris-v2026.5.12-record.md` 里的 "Runtime and config migration" 段。

### ACP / acpx 已停用（2026-05-18）

`extensions/acpx`、`agents.list.codex`（runtime: acp）、`bindings[]` 里的 ACP 路由**全部刻意关掉**。原因：

- Codex 走 native harness 已足够（per `extensions/acpx/skills/acp-router/SKILL.md`：「Codex chat binding defaults to the native Codex app-server plugin unless ACP is explicit」）
- 复杂编码任务用 `coding-agent` skill（spawn 后台 PTY 进程）替代 ACP 路径
- Codex home bridge feature（`feat(acpx): add codex home bridge`）已 drop，OAuth 改走 inline auth-profile（`openclaw models auth login --provider openai-codex`）

**升级时注意**：

- 不要在 cherry-pick / rebase 时把 `feat(acpx)` 或 ACP runtime backend 相关本地修复带回来
- `agents.list.codex` 不要再加回 config
- 别误信 doctor「acpx unreferenced sidecar」之类的提示 enable 回去
- `~/.openclaw/agents/codex/`、`~/.openclaw/workspace-codex/` 保留作历史归档，但 runtime 不会触发
- 如果要复活：`plugins.entries.acpx.enabled = true` + 在 `plugins.allow` 加回 `"acpx"` + 重新加 codex agent entry

### 新增补丁规则

```bash
# 在 fix/xxx 分支上开发
git checkout -b fix/xxx patch/chris
# 改代码、测试
# cherry-pick 到 patch/chris
git checkout patch/chris
git cherry-pick fix/xxx
# 或直接在 patch/chris 上提交（简单修复）
```

## 配置变更

### 修改配置

```bash
pnpm openclaw config set <path> <value>
```

批量修改时先暂停 cron：

```bash
pnpm openclaw config set cron.enabled false
# 做所有修改
pnpm openclaw config set cron.enabled true
```

### 当前关键配置

- Memory Wiki: bridge 模式，vault 在 `~/Documents/ChrisData/OpenClaw Wiki`
- Dreaming: 5 个 agent 都开启，每天 03:00
- Wiki bridge: indexDreamReports=true, indexDailyNotes=true, indexMemoryRoot=true, followMemoryEvents=true
- Wiki digest: includeCompiledDigestPrompt=true
- Proxy: 不设 HTTP_PROXY（Surge TUN 层覆盖）

## 故障排查

### Gateway 起不来

1. `launchctl print gui/$(id -u)/ai.openclaw.gateway` 看状态
2. `tail -20 ~/.openclaw/logs/gateway.err.log` 看错误
3. `pnpm openclaw doctor` 自动诊断（**只读，不要加 `--fix`**）
4. 看到具体问题用 `config set` 单点改

### Memory 不可用

1. `pnpm openclaw memory status` 检查
2. SQLite 损坏修复：
   ```bash
   cp bad.sqlite bad.sqlite.corrupt-bak
   sqlite3 bad.sqlite ".recover" | sqlite3 recovered.sqlite
   sqlite3 recovered.sqlite "INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');"
   sqlite3 recovered.sqlite "PRAGMA integrity_check;"
   mv recovered.sqlite bad.sqlite
   ```

### Agent 看到旧路径/旧配置

1. openclaw.json
2. 所有 shell 配置（.profile, .zshrc, **.zprofile**, .bashrc, .zshenv）
3. .env
4. LaunchAgent plist
5. **launchctl getenv**（独立于 shell！）
6. 内部 symlink
7. Agent 需要 /new 开新 session 刷新环境

## LaunchAgent plist 位置

- Gateway: `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- Media notifier: `~/Library/LaunchAgents/com.chris.media-notifier.plist`
- Velop manager: `~/Library/LaunchAgents/com.chris.velop-manager.plist`
- 小红书 MCP: `~/Library/LaunchAgents/com.openclaw.xiaohongshu-mcp.plist`

## 危险操作提醒

参见 CLAUDE.md 危险操作硬锁，以下操作**必须用户明确指示**：

1. `pnpm build`（主 repo）— 会覆盖正在跑的 gateway
2. `git rebase` / `git reset --hard`
3. `openclaw gateway restart`
4. `git push --force`
5. 升级版本/切换 tag
6. 修改 `cron/jobs.json`
7. `pnpm openclaw doctor --fix` —— 这台机上会强迁 pi + openai-codex/gpt-5.5 多 provider 配置
