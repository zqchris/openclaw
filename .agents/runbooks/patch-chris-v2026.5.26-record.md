# patch/chris v2026.5.26 升级记录

**日期**：2026-05-28 凌晨 00:35-00:45 本地
**source tag**：v2026.5.20 (e510042870)
**target tag**：v2026.5.26 (10ad3aa160, 上游 2026-05-27 11:27 UTC 出的 stable)
**pre-upgrade 标桩**：`pre-upgrade-v2026.5.26` → 771b8b5e7e（已 push origin）
**跨度**：1731 commits，4317 文件，+319k/-61k —— 极大版本窗口

## 决定

升。原因：iMessage 附件根读、Telegram diag log、Sharp→Rastermill、provider auth pre-warm（~4100×）、Memory dream 聚焦 live 这些直接命中 Chris 当前痛点；live signal 显示 Telegram 在用 `7902a21523` 救场（今天 10:21 还观察到 sendMessage network failure），Feishu 41050 silence 在阻挡 10+ 次/天 log spam。

## 补丁审计结果（22 → 20）

### Drop (4)

| commit                                                           | 原因                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `771b8b5e7e` Revert "classify read-only exec/bash..."            | 净抵消 `3a74e6c42b`                                                                                       |
| `3a74e6c42b` fix(agents): classify read-only exec/bash...        | 被上面的 revert 抵消                                                                                      |
| `13d9af97cc` fix(imessage): recover malformed chat zero payloads | 上游 #82642/#86705 有官方 `repairIMessageConversationAnchor`；live signal 显示 last 3 days anchorless = 0 |
| `1195320200` test(imessage): type repair RPC mock                | `13d9af97cc` 的配套 test                                                                                  |

### Skip → follow-up (1)

| commit                                                    | 原因                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e0e7692741` fix(codex): restore app-server dynamic tools | 上游 #87049 quarantine + `addNodeShellDynamicToolsIfNeeded`/`addSandboxShellDynamicToolsIfAvailable` 大改结构；Chris 的 `addExplicitOpenClawDynamicToolsForRestrictedAllowlist` 走的是不同 add-back 路径，机械合并会爆未定义函数。Live signal 显示 codex agent 3 天 0 session + gateway.log 0 dynamic-tools 事件 → 不阻塞主升级；需在新结构上重写后再上 |

### Port (auto-merge + 上游已吸收一部分)

| 新 commit (旧)                                             | 港口情况                                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `882c036c87` (011218fd58) live-model-switch caller default | 直接 port，上游同函数仍是 bug 版                                                                                                                                            |
| `1b5f88d7f5` (b9fc05a3e3) ssrf cloud-metadata + loopback   | 上游 #80751 重构后，Chris 的 `ALWAYS_BLOCKED_CLOUD_METADATA_HOSTNAMES` 还在 metadata.google.internal 防线；并存关系正确                                                     |
| `46831d5925` (d745661b89) feishu topic reply anchors       | 上游已吸收 `replyTargetMessageId`/`rootId`/`parentId` 字段解析 + naïve `resolveFeishuTopicAutoThreadAnchor`；Chris 的 smart `currentThreadTs` 优先版赢出，覆盖上游 naïve 版 |
| `fee7c90140` (88e590ff53) imessage transport "auto"        | 生成文件 conflict 取 --ours（上游），后续由 `eb3309e293` 修补：重生成 metadata + sha256                                                                                     |

### Clean apply

| 新 commit (旧)            | 内容                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `b7dcf49601` (a12b615203) | telegram upload-file → sendMessage + read 解释                    |
| `2cecb6de50` (e9eebf8b00) | feishu 41050 cache（live signal: 5.25-5.26 阻挡 10+ 次）          |
| `f29044aef7` (72bcd9a7bb) | memory-core dreaming excludeAgents                                |
| `fb6a5be011` (7902a21523) | telegram failed delivery recovery（live signal: 今天 10:21 救场） |
| `2019017237` (d7eb9586bf) | feishu quoted/root/thread media                                   |
| `ddcd0a8d28` (a509463b30) | silent-reply thread sessionKeys                                   |
| `b7dcf49601` (a12b615203) | telegram upload-file routing                                      |

### Docs-only (7, auto-keep)

`6c9729bc96`, `14bd3074fb`, `ab6e42433c`, `472caf33a2`, `f556118c63`, `3b96bc0de6`, `dcaddc8e93` —— 历次升级 record。

## 修补 commit (3)

| commit                                                                     | 原因                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eb3309e293` chore(rebase): regenerate metadata + sha256                   | 生成文件 conflict 取了 --ours 丢了 imessage transport 字段；`config validate` 报 "additional properties: transport"；手动 `pnpm config:docs:gen` + 跑 `scripts/generate-bundled-channel-config-metadata.ts` 重新生成 |
| `68b86599da` fix(telegram): return true on suppressed network-failure path | `fb6a5be011` 的 `return;` 跟 `Promise<boolean>` 类型签名不匹配；改 `return true;` 跟函数末尾保持一致；tsgo:prod 报 `bot-core.ts:410` 才发现                                                                          |
| `2281f8fe36` test(telegram): assert toBe(true)                             | 配套上面的 test 修正                                                                                                                                                                                                 |

## 验证

```
pnpm tsgo:prod           ✅ exit 0
pnpm build (×3)          ✅ all clean
dist self-check          ✅ node --input-type=module 'await import("./dist/index.js")' OK
                         ✅ dist/index.js stub 3288 bytes
                         ✅ dist-runtime/extensions/litellm/openclaw.plugin.json staged
node dist/index.js --version  ✅ OpenClaw 2026.5.26 (2281f8f)
node dist/index.js config validate  ✅ Config valid
vitest (9 个 Chris test 文件 / 159 cases)  ✅ all green
```

## Gateway 重启

```
Old: PID 88448 @ Tue 10AM, v2026.5.20 dist
New: PID 38616 @ 00:41:45, v2026.5.26 dist
状态: running, active, ready (gateway+heartbeat 起来用了 ~2.2s)
15 plugins 加载: active-memory, browser, codex, conversation-archive,
                 elevenlabs, feishu, google, imessage, litellm,
                 memory-core, memory-wiki, openai, tavily, telegram, xai
```

频道：

```
iMessage default          → running, works
Telegram default (葫芦)   → polling 起，token from config
Telegram ivy (Ivy)        → polling 起，token from config
Feishu default            → WebSocket connected, bot open_id 已解析
Gmail watchers            → chrisz83@gmail.com 已启
```

## 教训 / runbook 更新点

1. **生成文件 conflict 取 --ours 别忘了 build 后手动重生成**。`pnpm build` 不自动跑 `generate-bundled-channel-config-metadata.ts`。下次同区域 conflict 后第一件事是 `pnpm config:docs:gen` + script 重生成，否则 `config validate` 报 additional properties。
2. **"build 不影响内存里 gateway" 不完整**。已加载代码不受影响，但 dynamic-imported chunks 在重启前都会 `ERR_MODULE_NOT_FOUND`。Doctor / status / task-registry maintenance / control UI lazy load 都会触发。**结论：build 完成后 gateway 进入"半死"状态，重启前所有 lazy code path 都不安全。** Runbook 主章节已经反映这一点。
3. **destructive op 顺序保护**：`git checkout main` 失败（"Aborting"）后没看 exit code 直接 `git reset --hard v2026.5.26`，把 patch/chris 22 commits 全炸了。靠 `pre-upgrade-v2026.5.26` tag 救场。下次 destructive 命令前要 `git branch --show-current` 或 `set -e`。runbook step 1 已加这条警告。
4. **committer 在 branch reset 之后第一次跑会触发 pnpm install reconciliation**，最长可以卡 7+ 分钟。提前跑一次 `pnpm install --frozen-lockfile` 修复 node_modules 比硬等 committer 钩子更快。
5. **`git rebase -i <tag> <branch>`** 默认 base 是 tag commit，**如果 patch 分支 base 是另一个 release tag**（v2026.5.20 vs v2026.5.26），release-prep commits 会被算进 todo 里 → 必须用 `--onto <new> <old> <branch>`。

## TODO (follow-up)

1. 重写 `e0e7692741` 在新上游结构上：把 `addExplicitOpenClawDynamicToolsForRestrictedAllowlist` 重新接到 `addNodeShellDynamicToolsIfNeeded` / `addSandboxShellDynamicToolsIfAvailable` 之后。Live signal 触发条件后再做。
2. 下次 install 流程可以去掉 `SHARP_IGNORE_GLOBAL_LIBVIPS=1` env var —— Sharp 已被 Rastermill 取代。
