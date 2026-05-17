# patch/chris v2026.5.16-beta.4 update record

Date: 2026-05-17.

Purpose: emergency upgrade from `v2026.5.12` to `v2026.5.16-beta.4` to land upstream fixes for the silent telegram polling stale-socket + ingress-backlog stall that wedged the `main` agent's `@zkyo_bot` DM polling for ~10 hours.

Per CLAUDE.md `main_tracks_release_tags` policy, `main` normally locks to stable tags only. Chris explicitly allowed the beta tag this round because the upstream stable cut (`v2026.5.14`/`-beta.3`) did not yet include the load-bearing fixes.

## Source and target

- Source tag: `v2026.5.12` (`0358f3dda46dc17d3263e403f6ca895c4d0f749c`).
- Target tag: `v2026.5.16-beta.4` (`a35f8cde63da3d58e738c108b1b592dfe9d794b5`).
- Backup tag: `rebase-backup/patch-chris-pre-2026.5.16-beta.4-20260517` (`8ce42a7676e98db05cbb24eedd5b9c6aca4039ed`).
- Final pushed head: `c57de44bf5f5e7196977bbb6a8bd2884575b0350` (`docs(runbook): add patch/chris upstream runbook + 5.12 update record`).
- Final remote head: `origin/patch/chris` matches `c57de44bf5`.
- `origin/main` updated to `38c3a8dd48` (= `v2026.5.16-beta.4^{}`).

## Bug context (why this upgrade was urgent)

`agent:main:telegram:default:direct:435427284` stopped delivering inbound DMs at `~07:32 CST`; gateway health reported `healthState: stale-socket` for the default telegram account but never bounced the polling worker. Direct Telegram getUpdates probe confirmed 4 pending updates queued upstream while local `update-offset-default.json` was frozen at `lastUpdateId=99511066` (mtime `07:49`) vs Telegram `99511070`. `getMe` fetch-timeouts at `01:21` and `09:11:48` marked the smoke without acting.

The May 5/12-shipped polling stall detector (`5174c829cc detect polling stalls from getUpdates`) only fires when `noteGetUpdatesStarted/Finished` keep ticking; once the polling cycle exited without restart, the watchdog interval was cleared and no further detection ran. Upstream addressed this in `25a8f5f3f8 fix: surface stalled telegram ingress backlog` and the four sibling commits below.

## Patch stack accounting

- Pre-rebase local stack: 20 commits on top of `v2026.5.12`.
- Post-rebase local stack: 16 commits on top of `v2026.5.16-beta.4`.
- Net count: minus 4 commits (5 dropped, 1 unchanged identifier — see below).
- Branch diff against beta.4: 52 files, 3644 insertions, 257 deletions.

### Dropped local commits

| Old SHA      | Title                                                                                | Upstream equivalent in beta.4                                                                                                   | Reason                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `5174c829cc` | fix(telegram): detect polling stalls from getUpdates                                 | `56873b6065` (same patch)                                                                                                       | upstream cherry-pick now in release                                                                        |
| `e6ee85209e` | fix(telegram): reuse sticky IPv4 dispatcher for getMe health check (#76852) (#76856) | `0de6f93805`                                                                                                                    | upstream cherry-pick now in release                                                                        |
| `8ce42a7676` | fix(telegram): share API request timeout wrapper                                     | `42f6d90917`                                                                                                                    | upstream cherry-pick now in release                                                                        |
| `4ab76e4bf3` | feat(acpx): add codex home bridge                                                    | superseded by upstream `codex-trust-config.js` + `renderIsolatedCodexConfig` (commits `23f73b3ecf`, `99a6b1c5a8`, `a146bf03db`) | upstream picked a different ownership for isolated codex home; carrying the local feature was net negative |

`git cherry` also detected `f9652c7b09 Fix Telegram polling ingress under event-loop stalls (#81746)` and `31f7eff71a fix telegram ingress worker dist entry` were already in upstream; they live on the release/2026.5.12 ancestor side of `patch/chris` and were never replayed under the new base, so no explicit drop instruction was needed.

### Kept commits (16, replayed in order)

`bab349dace`, `93ce604d28`, `3ef9c0ceeb`, `38df93228c`, `fdaa358504`, `514e7ad687`, `57ef9c0e65`, `4765936fcb`, `b2e00208b5`, `db2be9032b`, `f808a44ca2`, `d8191cd52b`, `fbe1a15fcb`, `9fab9e784b`, `ea9b02a98f`, `c57de44bf5`.

Conflict resolutions during replay:

- `db2be9032b fix(agents): only validate transformed tool-result middleware output` — upstream test file already had four overlapping cases. Took HEAD's coverage in full and inserted the original commit's new `preserves untransformed tool results even when they exceed middleware bounds` case before `accepts well-formed middleware results`.
- `f808a44ca2 fix(feishu): pull attachments from quoted/root/thread history` — `bot-content.ts` rename of `inferPlaceholder` → `export inferFeishuMediaPlaceholder` collided with upstream's added `resolveSavedFeishuMedia` helper. Took upstream's helper plus the export rename (callers at L151/L482/L602 already used the new name).
- `9fab9e784b fix(runtime): finish imessage cutover rebase` — `extensions/acpx/src/codex-auth-bridge.ts` and `docs/.generated/config-baseline.sha256` conflicts were both tail-end residual from the dropped `feat(acpx)` commit. Took HEAD for both; baseline regenerates at build.
- `ea9b02a98f fix(telegram): delete tool-progress draft when sending final answer in progress mode` — `bot-message-dispatch.test.ts` had two upstream assertions pinning the prior buggy behavior plus one duplicate `clear` assertion. Took Chris's side both times to match the (auto-merged) source change.

## Config migration

- Removed `plugins.entries.acpx.config.codexHomeBridge` block from `~/.openclaw/openclaw.json` (config schema is `z.strictObject`; the dropped `feat(acpx)` knobs failed validation under beta.4).
- Backup at `~/.openclaw/openclaw.json.bak-pre-acpx-bridge-drop-20260517`.
- `pnpm openclaw config validate` reported `Config valid` after the removal.

If isolated codex home bridging is needed under beta.4, translate to upstream's `extensions/acpx` surface (the `codex-trust-config.js` family) rather than re-introducing the local commit.

## Build and self-check

- `trash dist dist-runtime && pnpm install --frozen-lockfile && pnpm build` ran clean on second attempt (first `pnpm install --frozen-lockfile` hung at ~0 CPU for 15 min while node_modules was already consistent; killing and re-running returned in 171 ms with `Already up to date`).
- `dist/index.js` 3288 B stub, `dist-runtime/extensions/litellm/openclaw.plugin.json` present.
- `node --input-type=module -e 'await import("./dist/index.js")'` passed.
- `pnpm openclaw config validate` passed after the acpx config removal.

## Runtime rollout

- Gateway bounce via `launchctl bootout` + `launchctl bootstrap`. First bootstrap returned `5: Input/output error`; retry after ~1 s succeeded (launchd post-bootout cleanup race; not a packaging defect).
- New gateway PID `32480`, version `2026.5.16-beta.4`, `state=running`.
- Telegram health: both `default` and `ivy` accounts report `running=true connected=true healthState=ok` and no `stale-socket` mark.
- First post-restart inbound at `13:08:11 CST`: `@zkyo_bot` direct, 76 chars — first `main` agent DM in ~10 hours.

## Verification gaps

- No live regression run on `extensions/feishu` quoted/root/thread media path under beta.4 — that ported commit (`f808a44ca2`) is exercised only by `test(feishu): cover resolveFeishuReferencedMessageMedia (cache + budget paths)` which was replayed clean.
- Did not run the full `pnpm check`/`pnpm test:changed` lanes before the bounce; cycle was prioritized for getting `main` agent responsive again. Run on next maintenance window if testbox capacity is free.
- Did not test the dropped `feat(acpx)` replacement upstream path against a real ACP session — if isolated codex behavior regresses, look at `23f73b3ecf`, `99a6b1c5a8`, `a146bf03db` first.
