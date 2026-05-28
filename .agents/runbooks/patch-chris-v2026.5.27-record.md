# patch/chris v2026.5.27 升级记录

**日期**：2026-05-29 凌晨 00:25-00:35 本地
**source tag**：v2026.5.26 (10ad3aa160)
**target tag**：v2026.5.27 (54f781c42d)
**pre-upgrade 标桩**：跳过 —— 21 commit 增量比上次（22）少，落点稳，且 `git log patch/chris ^v2026.5.26` 在升级前已经 clean reachable
**跨度**：261 commits / 上游 ~36h 窗口（5.26 stable 后第二天补丁）—— 小补丁版本

## 决定

升。理由：

- 大量 release/QA 内部硬化（#87452 discord recovered warning、media drain、release retry-after cap）—— 跟 Chris 用例只是间接相关，但都没风险
- `66a5748352` Telegram polling keepalive delay 下调（#83304）—— Chris 5.16-beta.4 时受过 polling stall 影响，跟 [[feedback_telegram_silent_polling_death]] 同一类
- `a03cd48b22` WhatsApp control char strip（#77114）—— Chris 不用，无害
- 没有破坏性 API 变更，feishu 接口变化是 5.26 已经发生的（buildChannelInboundEventContext），这次只是延续

## 补丁审计结果（21 → 21，无 drop）

```
21 Chris commits on top of v2026.5.26
21 Chris commits on top of v2026.5.27（rebase 后）
+ 2 修补 commit（rebase port + regen）
```

| 类别                                | 数量 | 备注                                                                                 |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| Clean apply（rebase auto-merge 过） | 16   | 全部 docs/runbooks + 多数 fix(\*) commit                                             |
| Soft conflict（auto-resolved）      | 3    | imessage send.test.ts、telegram channel-actions.test.ts、feishu bot.ts（轻微 drift） |
| Hard conflict（手动 port）          | 2    | feishu bot.ts buildChannelInboundEventContext 重组、bot.test.ts 4 个 assertion 翻新  |

### Hard conflict 详情

**feishu bot.ts**: 上游本次没动 inbound context API（v2026.5.26 已经迁移），但 rebase 把 Chris 的 `messageThreadId` 智能逻辑（5.26 record 里手动 port 的部分）合并丢了 —— 出现死变量 `messageThreadId` 触发 TS6133。手动：

1. 把 `replyTargetMessageId` / `preferThreadRootReplyTarget` / `isTopicSession` / `configReplyInThread` 从 line 1518 提到 `buildCtxPayloadForAgent` callback 之前
2. 把 `supplemental.quote.id` 改成 `ctx.replyTargetMessageId ?? ctx.parentId`
3. 把 `reply.replyToId` 同样改成 `ctx.replyTargetMessageId ?? ctx.parentId`
4. 把 `reply.messageThreadId` 改成 `replyInThread ? replyTargetMessageId : ctx.rootId && isTopicSessionForThread ? ctx.rootId : undefined`（这才是 Chris patch 的原始智能逻辑）

**feishu bot.test.ts**: 5.26 rebase 已经把 4 个 `toHaveBeenCalledWith(expect.objectContaining({...}))` 漏了第二个 `undefined` 参数（finalize 选项参数），还有 1 个 test 在新 nested API 下 `ReplyToBody` 字段不在 top-level 而在 `SupplementalContext.quote.body`。

- 4 个补 `undefined,` 第二参
- 1 个翻新成 `SupplementalContext: expect.objectContaining({ quote: expect.objectContaining({ body: "..." }) })`

### 21 commit 完整 roster

```
fd0352dd03 chore: regen config-baseline + bundled-channel-metadata (NEW 修补)
b0dfec5453 fix(feishu): port reply-anchor patches to buildChannelInboundEventContext (NEW 修补)
644c95f2c8 feat(memory-core): excludeGroupIds dream filter + cleanup script
e2061c8f65 docs(runbook): v2026.5.26 record + step 1 backup rework
3a7bd1a4b8 test(telegram): assert toBe(true) for suppressed network-failure path
2f2cff8843 fix(telegram): return true on suppressed network-failure path
687ffbc703 fix(telegram): route 'upload-file' to sendMessage + read 解释
2f778bfe56 fix(feishu): silence and cache 41050 'no user authority'
57b1231087 docs(runbook): record v2026.5.20 iMessage bridge incident
f7377166fc fix(imessage): default imsg send transport to "auto"
71133b15fa docs(runbook): record v2026.5.20 upgrade + patch stack rework
3b75c192e4 fix(memory-core): exclude configured agents from dreaming sweeps
33425e0e6b docs(runbook): record v2026.5.19 update
8b47ce8107 fix(telegram): recover failed final delivery
760a352516 docs(runbook): record v2026.5.18 update
3b1bc690f0 docs(runbook): document acpx disabled state
f1992d5bc7 docs(runbook): record v2026.5.16-beta.4 emergency upgrade
2f0321abac docs(runbook): add patch-chris-upstream.md + 5.12 update
cabe0d876f fix(feishu): pull attachments from quoted/root/thread history
edaeb2c13b fix(feishu): preserve topic reply anchors
a634dc9bd6 fix(silent-reply): classify thread sessionKeys correctly
4bbee62678 fix(ssrf): honor allowPrivateNetwork for loopback
7afe8068c3 fix(agents): respect caller-supplied model in live session switch check
```

## 验证

```
pnpm tsgo:prod                              ✅ exit 0
pnpm build                                  ✅ built in 394ms
dist self-check                             ✅ await import('./dist/index.js') OK
node dist/index.js --version                ✅ OpenClaw 2026.5.27 (644c95f → b0dfec5 → fd0352d)
pnpm config:docs:check                      ✅ OK
pnpm config:channels:check                  ✅ OK
vitest extensions/feishu/src/bot.test.ts    ✅ 75 / 75 passed
vitest（前一轮 12 个 Chris 测试文件）       ✅ 300 / 304 → 4 failing on feishu →
                                              全部 fix 后 304 / 304 green
```

## Gateway 重启

Chris 要求执行，已完成。

```
Old: pid 63495 @ v2026.5.26
New: pid 95033 @ v2026.5.27 (running, active, 00:38 local)
重启路径: launchctl bootout + bootstrap（绕开 gateway-side restart）
```

**重启 footgun**: `pnpm openclaw gateway restart --safe` 第一次直接报 `ERR_MODULE_NOT_FOUND: restart-LErdFLZl.js imported from server-methods-DNtg9Mfr.js`。原因：build 已经把旧 dist 覆盖掉，但 gateway 进程还在跑旧 v2026.5.26，里面的 lazy `restart-*` chunk 在硬盘上已经不存在 → safe-restart 走的是 gateway-side import 路径就 ENOENT。Build 之后 gateway 已经进入"半死"状态（[[feedback_dist_orphan_chunk_during_rebuild]]），**任何依赖 gateway 自身 lazy import 的 restart 命令都不安全**。

**唯一稳定的重启路径（build 之后）**：

```
rm -rf dist .tsdown .artifacts/tsgo-cache    # full clean
pnpm build                                   # rebuild fresh
node -e 'import("./dist/index.js")'          # top-level self-check
node -e 'Promise.all([import("./dist/server.impl-*.js"),
                      import("./dist/server-methods-*.js")])'  # deep self-check
launchctl bootout gui/$(id -u)/ai.openclaw.gateway
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

**重启后健康**：

```
版本一致                 ✅ CLI 2026.5.27 == Gateway 2026.5.27（不再有警告）
Channels                ✅ feishu / imessage / telegram 全 ON+SETUP
插件加载                 ✅ 3 个全部从新 dist 路径载入
Telegram polling        ✅ default + ivy 双 ingress 起来
imsg provider           ✅ Mac mini SSH wrapper 起来
Gateway 重启后 0 ERROR
```

## 教训

1. **rebase port 后的 messageThreadId 智能逻辑别相信 auto-merge**。5.26 record 已经把这个逻辑手动 port 过一次，5.27 rebase 又丢了 —— 因为 `replyTargetMessageId` 定义位置在 callback 之后，rebase 把 Chris 的代码块合并到原位但 callback 引用的变量未在作用域。任何"代码块上移修复"在下次 rebase 都会再丢一次。**下次 rebase 看到 feishu bot.ts conflict，第一件事 grep `replyTargetMessageId` 位置 vs `buildCtxPayloadForAgent` 位置**。
2. **`toHaveBeenCalledWith(expect.objectContaining({...}))` 上游已经迁到 2-arg `(ctx, options)` 形式**。5.26 时 4 个 feishu test 已经漏补第二个 `undefined`，5.27 又出现一次 —— 因为不是每个 assertion 都补了，next rebase 会继续漏。**记忆点：vitest matchers 默认严格匹配 arg count，objectContaining 不会 match 缺失的 trailing args**。
3. **regen 的 generated files 在 rebase 期间正常会 drift**。5.26 record 已经写了"build 不自动跑 generate-bundled-channel-config-metadata.ts"。5.27 这次直接靠 `pnpm config:docs:check` + `pnpm config:channels:check` 验证当前文件 OK —— 但 `git diff` 显示文件依然 dirty。结论：generated artifacts 即使 `--check` 通过也可能跟 base commit 不一致，**安全做法是每次 rebase 完后跑一次 `pnpm config:docs:gen` + `pnpm config:channels:gen` 把文件覆写到当前 source-of-truth**。
4. **小窗口升级（≤36h，~250 commits）不需要 pre-upgrade tag**。5.26 那次跨 1731 commits 需要 tag；这种 36h 增量风险面集中在 generated files + 测试 mock signature 漂移，git reset 回滚不到 21 commits 也容易重做。Runbook step 1 应该明确这条阈值。

## TODO (follow-up)

无新 follow-up。5.26 留下来的 `e0e7692741` codex dynamic tools port 仍未启动 —— Live signal 仍无；不阻塞。
