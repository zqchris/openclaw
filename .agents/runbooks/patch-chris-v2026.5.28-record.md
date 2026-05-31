# patch/chris v2026.5.28 升级记录

- Source tag: `v2026.5.27`
- Target tag: `v2026.5.28`(2026-05-30 发布,上游标 Latest)
- 回滚锚点: `pre-upgrade-v2026.5.28` → `7b01c64a2f`(push 到 origin)
- patch/chris HEAD after: `5d82fd8ead`
- 拓扑: .27 与 .28 是**并行 release 分支**(共同祖先 `v2026.4.19-beta.2` 时代),非线性父子。rebase 用 `--onto v2026.5.28 v2026.5.27 patch/chris`,只 replay 本地 25 commit;**不能用 `git rebase main`**(会把 52 个上游 .27 release commit 也 replay)。

## 决定

升。理由:Telegram polling 加固(呼应历史静默轮询死亡)、iMessage 反应/审批、Codex app-server 恢复、保留显式 agentRuntime pin、Claude Opus 4.8。落后一个 stable,趁补丁栈还瘦(14 功能补丁)及时跟。

## 补丁审计结果(25 → 25,0 drop)

Explore agent 逐条审计 14 个功能补丁 vs v2026.5.28 当前文件状态:**0 个被上游吸收,全 KEEP**。.27 的 regen commit(`fd0352dd03`)在 rebase 时 **skip 掉**,改为 build 后为 .28 重新生成(`5d82fd8ead`)。

| 类别        | 数量                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| DROP        | 0                                                                            |
| KEEP 干净   | 10                                                                           |
| KEEP 需适配 | 3(feishu reply-anchor、ssrf loopback、silent-reply、telegram final delivery) |

## 冲突 / 适配详情

| 补丁                                                         | 冲突点                                                                                                                                | 解法                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `08fb975939` live-model-switch                               | .28 把 `pi-embedded-runner/run.ts` → `embedded-agent-runner/run.ts`,并把 `legacyBeforeAgentStartResult` 改名 `beforeAgentStartResult` | 取 .28 命名 + 保留 `runDefaultProvider/runDefaultModel` 捕获两行  |
| `1914211459` imsg transport                                  | .28 在同位置加了 `timeoutMs`,撞 `transport` 行                                                                                        | 两个独立新增都保留                                                |
| `1914211459` imsg send.test.ts                               | git 行级 auto-merge **丢了一个 `}`**(prior `it` 块未闭合)→ parse error                                                                | 补回 `});`(已折叠进补丁)                                          |
| `32e25c8350` telegram channel-actions.test.ts                | 同源 brace-loss merge artifact                                                                                                        | 补回 `});`(已折叠)                                                |
| `32e25c8350` telegram channel-actions.ts + action-runtime.ts | .28 新增 `unicorn/no-array-sort` lint 规则,`.sort()` 报错                                                                             | `.sort()` → `.toSorted()`(`Object.keys()` 新数组,行为等价;已折叠) |
| `e64044903b` feishu reply-anchor                             | 审计标 HIGH risk(.28 重构 inbound),但 git 干净 apply                                                                                  | feishu 测试全过(89 tests),语义无 drift                            |

> **brace-loss 教训**:补丁在某 describe 末尾插入新 `it()` 块,假设 .27 的闭合 brace 布局;.28 重构了同区域,git 行级合并丢了 prior `it` 的 `});`。两个测试文件(imsg send.test、telegram channel-actions.test)同时中招。`tsgo` 不报(它跑 typecheck,空 describe 合法),靠 **vitest transform parse error** 抓出来。升级时务必跑针对性测试,不能只信 typecheck。

## 功能补丁 roster(15 个,排除 10 个 docs)

```
5d82fd8ead chore: regen config-baseline + bundled-channel-metadata for v2026.5.28
e64044903b fix(feishu): port reply-anchor patches to buildChannelInboundEventContext
47a538f7b9 feat(memory-core): excludeGroupIds dream filter + cleanup script
3f4fcf389b test(telegram): assert toBe(true) for suppressed network-failure path
fa3d89eb6c fix(telegram): return true on suppressed network-failure path
32e25c8350 fix(telegram): route 'upload-file' to sendMessage + explain 'read'
049bdcef7e fix(feishu): silence and cache 41050 'no user authority'
1914211459 fix(imessage): default imsg send transport to "auto"
d15f880907 fix(memory-core): exclude configured agents from dreaming sweeps
444cd4bb56 fix(telegram): recover failed final delivery
92a96e9a56 fix(feishu): pull attachments from quoted/root/thread history
542b51aa12 fix(feishu): preserve topic reply anchors
be1e8df334 fix(silent-reply): classify thread sessionKeys correctly
cffeac789b fix(ssrf): honor allowPrivateNetwork for loopback hostnames
08fb975939 fix(agents): respect caller-supplied model in live session switch
```

## 验证

- `pnpm build` 干净(trash dist dist-runtime → build,134s,exit 0)
- 5.5 自检:dist-runtime stage 完整、`dist/index.js` stub 3288B、`import("./dist/index.js")` 通过
- 针对性测试 10 文件全绿:feishu(89)、telegram bot-message(11)+channel-actions、imessage send(24)、memory dreaming、live-model-switch、ssrf、silent-reply
- `pnpm check:changed --base v2026.5.28`:typecheck/lint/format/import-cycles/conflict-markers/guards 全 ok(EXIT=0)
- `pnpm openclaw config validate`:`~/.openclaw/openclaw.json` 符合 .28 schema
- 频道探测(restart 后):Feishu(FiloMail)、iMessage、Telegram 葫芦(@zkyo_bot polling)、Telegram Ivy(@heyivybot)全 `works`

> ⚠️ **dist 一致性坑**:第一次 build 在 `.toSorted()` 源码修正之前;改源码后**重新 build** 才让 dist 与最终源码一致。源码 build 后再改,必须 rebuild。

## Gateway 重启(本轮非手动,doctor --fix 触发)

**`doctor --fix` 顺手重启了 gateway**——这是本轮最大意外。链条:

1. build 后老 gateway(pid 98194,.27 dist)还在内存跑
2. 我对它跑了 `config validate` / `doctor` / 频道探测等 `pnpm openclaw` 命令 + 健康探测 → 触发老 gateway 的 **lazy dynamic import**,撞上新 dist 的新 hash chunk → `ERR_MODULE_NOT_FOUND: dist/health-CN-s9efy.js`
3. `doctor --fix` 检测到 gateway erroring → `[restart] killing stale gateway 98194` + 重启 LaunchAgent → 新 pid 34211 加载 .28 dist

结果是好的(干净起到 .28),但**违反了「agent 不主动重启 gateway」原则**——重启时机本该 Chris 定。

**核对**:`openclaw status` → Gateway app **2026.5.28**,pid 34211,state active,reachable 52ms,auth OK(Mac-Studio 192.168.50.198)。config 迁移干净:版本戳(5.27→5.28、5.20→5.28)+ voice key 重命名 `voiceId`→`speakerVoiceId`(值保留)。**无多 provider 链改动**。

## 教训

1. **`doctor --fix` 可能重启 gateway**(检测到 unhealthy 时)。它不是纯 config 操作。如果不想动 gateway,别在「老 gateway + 新 dist」状态下跑 `--fix`。
2. **build 后别对老 gateway 跑 `pnpm openclaw` 命令 / 探测**:会触发老内存版 lazy dynamic import 撞新 dist → orphan-chunk fatal。正确顺序:build + 纯 node import 自检 → 等 gateway 重启到新 dist → 再跑 `config validate` / `doctor` / 频道探测。
3. **doctor --fix 解禁**:2026-05-29 起在这台机安全(pi+openai-codex 多 provider 链已全迁 codex)。runbook 里旧的「绝不 --fix」硬锁本轮已全部更新。见 memory `doctor_fix_caveat`。
4. **brace-loss merge artifact**:见上,typecheck 抓不到,靠 vitest parse error。

## TODO (follow-up)

- 无 drop;补丁栈维持 25(15 功能 + 10 docs),健康。
- 下轮可考虑把 feishu reply-anchor `e64044903b` 真正上游化(refs #84329 imsg 同理),减栈。
