# patch/chris v2026.6.1 升级记录

- Source tag: `v2026.5.28`
- Target tag: `v2026.6.1`(2026-06-03 发布,上游标 Latest)
- 跳过的中间版本:5.29 / 5.30 / 5.31 / 6.0 全是 beta/alpha,无正式 stable(按 main-only-tracks-stable)
- 回滚锚点: `pre-upgrade-v2026.6.1` → `ff4b3e8eb7`(push 到 origin)
- patch/chris HEAD after rebase: `892816bfb2`(+ feishu 适配 `19e6b948a3` + 本 record)
- 拓扑: 5.28 → 6.1 是相邻 stable,`git checkout main && git reset --hard v2026.6.1` 后 `git rebase main`。rebase 自动 skip 19 个 patch-id 一致的已合补丁,其余手动逐个判。

## 决定

升。理由:Codex app-server 恢复(中断 tool call / stale binding / compaction handoff / idle timer,#88129/88136/88141/88162/88182,8 个 agent 全 codex 直接受益)、频道稳定性(Telegram/WhatsApp/iMessage retry timer 收口,#88183)、全局 timer/retry bounding(直击历史 [[feedback_telegram_silent_polling_death]] 静默死亡)、iMessage monitor 转 SQLite。

## 补丁审计结果(43 独有 → 27 keep / 16 drop)

本轮**首次出现大批 drop**——关键发现:**上游 6.1 把 Chris 自己的多个 feishu 补丁 upstream 了**,本地版本反而是过期港。

| 类别                         | 数量 | 说明                                                                                 |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------ |
| 自动 drop(patch-id 一致)     | 19   | rebase 自动 skip,6.1 已含                                                            |
| 手动 drop(release-prep)      | 7    | 5.28 changelog/prepare/baselines,6.1 自带                                            |
| 手动 drop(被 6.1 升级版取代) | ~6   | 见下                                                                                 |
| KEEP 干净 / docs             | 多数 | feishu attachment、telegram、imessage、memory-core、silent-reply、全部 docs(runbook) |
| KEEP 需手动适配              | 4    | net-policy、silent-reply import、feishu 41050、server-channels                       |

### 被 6.1 取代而 drop 的功能补丁(逐个核对上游确实覆盖)

| 补丁                                                  | 上游 6.1 现状                                                                                                                                                                                                            | 判定 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `542b51aa12` feishu preserve topic reply anchors      | 6.1 已 upstream:`reply-dispatcher.ts` 有 sessionKey + ensureNoVisibleReplyFallback;`bot.ts` 有 `replyTargetMessageId = ctx.rootId ?? ctx.replyTargetMessageId ?? ctx.messageId`。本地版还引用已删的 typingMessageId 机制 | drop |
| `e64044903b` feishu port reply-anchor                 | 同上;本地引用已删的 `resolveFeishuTypingTargetMessageId`/`preferThreadRootReplyTarget` → 强打即编译错                                                                                                                    | drop |
| `00d87c7b5d` subagent dm completion delivery (#88182) | 6.1 有更完整版(`resolveGeneratedMediaDirectFallbackUrls` + `visible_reply_missing`)                                                                                                                                      | drop |
| `228bed7da5` codex cap app-server idle timers         | 6.1 `resolvePositiveIntegerTimeoutMs` 全套 idle resolver + `addTimerTimeoutGraceMs`                                                                                                                                      | drop |
| `bf42c73d18` cap session wait timeouts                | 6.1 `run-wait.ts` 已 `clampTimerTimeoutMs` + terminal-outcome 重构                                                                                                                                                       | drop |
| `31a46638ad` show chat errors as visible              | 6.1 有 `broadcastChatError` + `chat.error-broadcast.test.ts`                                                                                                                                                             | drop |
| `ae0a2ecf4d` bound orphan transcript scan             | 6.1 有 `CLAUDE_CLI_ORPHAN_PROBE_TAIL_BYTES` + `SESSION_FILE_MAX_RECORDS=500`                                                                                                                                             | drop |

## 冲突 / 适配详情

| 补丁                                          | 冲突点                                                                                                        | 解法                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5b8cc7d6bf` net-policy 内联                  | 5.28 把 net-policy 内联进 `src/shared/net/`;6.1 反向重模块化回 `packages/net-policy/` 并改了 `ip.ts`/`redact` | **drop 内联**,跟随 6.1 的 packages/net-policy 结构                                                                                                                                 |
| `358251dd81` silent-reply                     | 6.1 把 string-coerce 挪进新包 `@openclaw/normalization-core`                                                  | import 合并:6.1 路径 + 保留本地 `parseThreadSessionSuffix` import                                                                                                                  |
| `8ac6c2e936` feishu 41050                     | 6.1 重写了 `bot-sender-name.ts`(自带 senderNameCache,但只认 99991672,**不认 41050**)                          | graft:41050 负缓存逻辑并入 6.1 新缓存;cache-hit 返回用 `cached.name ? {name} : {}`,`now=Date.now()` 保证负缓存写是 number;两套 test 合并(我的 4 用例 + 6.1 的 Date-range 溢出用例) |
| `4d0c2fd6cc` feishu attachment + `19e6b948a3` | drop `542b51aa12` 后 `quotedMessageId` 未定义,kept attachment 补丁仍引用 → **tsgo TS2552**                    | 6.1 用 `getMessageFeishu({messageId: ctx.parentId})` 抓 quoted,故 `quotedMessageId`→`ctx.parentId`(fallback id + root/quoted dedup);单独 commit `19e6b948a3`                       |
| `892816bfb2` server-channels reset-restart    | 6.1 重写文件 161 行,把 cleanup 回调 `.finally(` 改成 `.then(`                                                 | 用 6.1 的 `.then(` + 我的 timer 清理块;其余(generations map / startGeneration / timer setup)git 干净合入                                                                           |
| `428aabde81` ssrf loopback                    | **无冲突**,干净 apply 到 `src/infra/net/ssrf.ts`(6.1 函数签名 `isBlockedHostnameNormalized` 等未变)           | 保留。⚠️ 中途我一度查错路径(去 net-policy 找,实际在 `src/infra/net/ssrf.ts`)虚惊"补丁丢了",已澄清:SSRF 完整保留(+52/-4)                                                            |

## 验证(build 前,build-free)

- `pnpm tsgo:prod`(core + extensions 生产 typecheck):✅ 全过(修 feishu TS2552 后)
- `pnpm check:test-types`(tsgo:test core + extensions):✅ 全过
- resolved-surface 测试:server-channels(39)、feishu bot-sender-name(8)、silent-reply、ssrf 全绿
- feishu bot 测试:73/73(验证 quotedMessageId→ctx.parentId 不破坏行为)
- **未跑** `pnpm build` / `pnpm check:changed` 全门禁(按 Chris「先不 build」)

## Codex review(high effort)

- 4 finder(手动解决面 / feishu bot.ts / 干净应用补丁 / dropped-patch 行为丢失)+ 1 verify
- 收敛到**唯一焦点**:drop feishu reply-anchor 后,`reply.replyToId: ctx.parentId` 是否让 topic/thread 回复落错
- **verify 结论:REFUTED**。出站回复落点由 `replyToMessageId`(= `replyTargetMessageId`,topic 时 `ctx.rootId` 优先)决定,inbound 的 `reply.replyToId` 只是元数据不驱动落点;Feishu API `send.ts:177` 用 `replyToMessageId`。6.1 锚定等价
- server-channels timer-leak 假说经深查自我否定(timer 仅在 approval bootstrap 后设,promise chain 清理覆盖)
- telegram/imessage/live-model-switch/memory-core:全干净(live-model-switch 确认是 fix 非 regression)
- **净结论:无确认正确性 bug**。唯一真 bug(feishu TS2552)已 typecheck 抓修

## 教训

1. **上游会吸收 Chris 自己的补丁**。Chris 是 openclaw contributor,他的 feishu reply-anchor 已 upstream 进 6.1。审计时对每个本地补丁都要查"上游是不是已经有了(可能是 Chris 自己提的)",别默认 local-only。本轮 16 drop 里一半是这种。
2. **clean-apply ≠ 语义正确**。`4d0c2fd6cc` git 干净 apply,但 drop 了定义 `quotedMessageId` 的兄弟补丁后引用悬空。靠 **tsgo** 抓出(呼应 5.28 的 brace-loss 教训:typecheck + targeted test 都要跑)。
3. **查"补丁丢没丢"要认准文件路径**。SSRF 补丁在 `src/infra/net/ssrf.ts`,不在 net-policy 包;我一度查错路径误判丢失。`git show <hash> --stat` 看准文件,别被长 commit message 挤出 sed 窗口骗了。
4. **doctor/typecheck 都不抓的语义回归靠 codex review + 升级后实测**。feishu 锚定这种,review 判等价,仍建议升级后发真实消息验证。

## TODO (follow-up)

- ⛔ **build 前必做**:`zqchris/openclaw-backup` daily cron **挂了**(最后提交 2026-05-30,连续 5 天没跑)。这是 build+重启的 state 回滚兜底。修活 cron 或先手动备份一次再 build。
- **未 build / 未 restart / 未 push**(本 record 写时)。下一步:push patch/chris(--force-with-lease)→ 择时 build + 5.5 自检 + 重启 + 预热。
- **升级后实测**:Feishu topic/群发消息,确认回复落在正确 thread(review 判 6.1 等价,但改动面大值得真实验证);Telegram/iMessage 频道探测。
- 补丁栈 27(含 ~11 docs)。drop 16 后功能补丁栈明显变瘦——6.1 吸收了 feishu/codex/agents 多个本地修复。
