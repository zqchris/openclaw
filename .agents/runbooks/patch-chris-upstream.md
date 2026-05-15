# patch/chris upstream runbook

Purpose: keep `patch/chris` usable across machines while it carries a private patch stack on top of OpenClaw releases. Read this before checking upstream updates, rebasing, pushing, or changing the local gateway runtime from this branch.

## First scan

1. Run `pnpm docs:list`.
2. Read this file before Git diffing broad upstream history.
3. Check `git status --short --branch`, remotes, current HEAD, `origin/patch/chris`, and available upstream release tags.
4. Treat `.agents/local/PROJECT_NOTES.md` as machine-local context only. It is excluded locally and does not travel with this branch.

## Operating model

- Prefer a named release tag or beta tag over moving `upstream/main`.
- Do not use raw ahead/behind counts as the decision. First decide the target version and user-visible reason to move.
- Keep code movement separate from runtime movement. Rebase and validate the code first; only then decide whether to rebuild, restart the gateway, run doctor, or reset sessions.
- Before rewriting history, create a backup tag such as `rebase-backup/patch-chris-pre-<target>`.
- Keep `patch/chris` as a patch stack, not a dumping ground. Drop patches already absorbed upstream and fold fixups into their owning patch when practical.

## Red lines

- Do not directly rebase `patch/chris` onto moving `upstream/main` unless the operator explicitly asks for main, not a release tag.
- Do not run `doctor --fix` as an early step. Older builds around the 2026.5.x upgrade path exposed serious config-repair hazards, including removal or stale repair of managed cron/runtime bridge state. Back up config first, inspect doctor output, and only run fix paths after the code target and runtime plan are clear.
- Do not let `doctor --fix`, update repair, or session reset become a substitute for code validation. Runtime/session health and branch correctness are separate gates.
- Do not change live gateway/runtime state until the code branch has passed the agreed validation floor.
- Do not assume BlueBubbles/iMessage ownership from memory. Check whether `extensions/bluebubbles` or `extensions/imessage` exists at the target tag and decide whether a patch is still owned, obsolete, or needs a port.
- Do not trust similar upstream PR titles. Use patch-id, file diff, and behavior to decide whether a local patch was actually absorbed.
- Do not expose credential files or auth-profile contents while investigating runtime labels or doctor output. Report paths and state, not secret values.
- Do not push a rewritten `patch/chris` without checking the current remote head and using lease protection.

## Upstream assessment

For each candidate target:

1. Compare current base, target tag, and `patch/chris`.
2. Group upstream changes by user-visible surface: Telegram, Feishu, Codex/ACP, gateway/session/runtime, doctor/update/config, plugin install, UI/status, and release/build-only.
3. Mark each local patch as:
   - keep: still needed and not upstreamed
   - drop: upstream has equivalent behavior
   - port: owner moved or target API changed
   - defer: not relevant to the chosen target
4. Pay special attention to historical conflict areas: BlueBubbles route/cache behavior, Feishu topic/reply media, memory-core dreaming filters, ACPX/Codex home bridge, SSRF/network guards, auth-profile/status labels, silent-reply/session routing, and generated config baselines.

## Rebase sequence

1. Save start state: current HEAD, target tag SHA, patch count, and remote branch head.
2. Create the backup tag.
3. Rebase onto the chosen tag.
4. Regenerate generated baselines when the rebase touches config or plugin SDK contracts.
5. Run patch-id or semantic duplicate scan against target/upstream before keeping old patches.
6. Fold fixups into the owning patch instead of leaving follow-up cleanup commits.
7. Recheck stack count and changed files.

## Validation floor

Use the narrowest proof that matches the touched surface, then widen only when needed.

1. `pnpm install --frozen-lockfile` if lockfile or package metadata changed.
2. `pnpm config:docs:check` after config baseline regeneration.
3. Targeted tests for every touched patch surface.
4. Targeted `oxfmt --check` on changed files.
5. `pnpm build` before touching runtime, gateway dist, package surfaces, lazy boundaries, generated SDK/API output, or release/build files.
6. `pnpm check:changed --base upstream/main` or Testbox equivalent before handoff/push when code/runtime/config behavior changed.
7. If Testbox is unavailable, record the local fallback mode and the reason.

## Runtime rollout

Only after code validation:

1. Decide whether to rebuild and restart the gateway.
2. Back up current runtime config before any fix/repair command.
3. Run status checks that distinguish actual runtime state from stale labels.
4. Use session reset or `/start` only when display/session freshness matters.
5. If `doctor --fix` is needed, inspect before/after config diff and record what changed.
6. Verify the main Telegram session and any relevant ACP/Codex session after restart.

## iMessage cutover notes

Checkpoint from 2026-05-15, before moving from BlueBubbles to the upstream `imessage` plugin:

- Latest checked release line: `v2026.5.12` stable and `v2026.5.14-beta.1` beta both carry the BlueBubbles removal path. At those refs `extensions/bluebubbles` is gone and `extensions/imessage` is the supported runtime.
- Current `patch/chris` base before the cutover assessment was `v2026.5.7`; local patch stack still contains BlueBubbles-specific fixes and cron transcript mirroring patches. Treat those as drop/port candidates during a rebase, not as automatically reusable fixes.
- The Mac mini relay host is reachable by SSH on the same LAN host used by the old BlueBubbles server. Do not rely on remote shell `PATH`: non-interactive SSH did not include Homebrew. Any OpenClaw `channels.imessage.cliPath` wrapper must call `/opt/homebrew/bin/imsg` or set `PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin`.
- Mini `imsg` was verified over SSH with `/opt/homebrew/bin/imsg`: chat listing parsed as NDJSON, history reads parsed with attachments metadata shape, `watch --json` stayed up for a short idle window without stderr, and `status --json` reported Messages.app connected with advanced/private API features ready. A real send was intentionally not performed without an operator-specified target.
- Mini `imsg` install was `0.8.1`; after Homebrew tap refresh, `steipete/tap/imsg` advertised `0.8.2` as current. If upgrading `imsg`, retest `status`, `chats`, `history`, `watch`, and one operator-approved send before changing OpenClaw traffic.
- SIP on the mini was disabled and private API status was already ready. Do not run `imsg launch` casually: it kills and relaunches Messages.app. Use it only when `imsg status --json` or `openclaw channels status --probe --channel imessage` says the bridge is unavailable.
- Current runtime config still routes `channels.bluebubbles`; the active BlueBubbles server responded on the mini. Keep it as the rollback observation path until iMessage DM, group, attachment, and action checks pass.
- Translate behavior keys from `channels.bluebubbles` to `channels.imessage`: `dmPolicy`, `allowFrom`, `groupPolicy`, `groupAllowFrom`, `groups`, `actions`, attachment policy, `mediaMaxMb`, `textChunkLimit`, `blockStreaming`, and coalescing settings. Drop only transport keys such as `serverUrl`, `password`, and webhook path.
- With `groupPolicy: "allowlist"`, the `groups` block is load-bearing. Copy it verbatim or add an explicit wildcard/per-chat entry; otherwise group traffic can be dropped even when `groupAllowFrom` passes.
- Update persistent ACP/channel bindings from `match.channel: "bluebubbles"` to `"imessage"`. Old BlueBubbles session keys do not become iMessage session keys, so preserve session files/backups but do not promise automatic chat-history continuity inside agent transcripts.
- Current OpenClaw cron config had no active task entries, but local/private patch scripts and LaunchAgents still referenced BlueBubbles. Audit scripts before disabling the BlueBubbles app/server; especially do not run old `post-update-patch.sh` against a target where `extensions/bluebubbles` no longer exists.
- Do not enable both BlueBubbles and iMessage monitors on the live gateway unless intentionally doing a bounded parallel test. Preferred sequence: add disabled `channels.imessage`, stop gateway, enable/probe iMessage, run DM/group/action tests, then cut traffic over and only later remove BlueBubbles.

## Push and record

Post-rebase records:

- `v2026.5.12`: `.agents/runbooks/patch-chris-v2026.5.12-record.md`

Before push:

1. Confirm worktree cleanliness and final HEAD.
2. Fetch the current remote branch head.
3. Push with force-with-lease when history was rewritten.
4. Record source tag, target tag, kept/dropped/ported patch count, validation proof, runtime health, config migrations, and follow-up warnings.

Record cross-machine-safe notes in this tracked runbook or a sibling tracked note. Keep machine-local state in `.agents/local/PROJECT_NOTES.md`.
