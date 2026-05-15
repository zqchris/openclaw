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

## Push and record

Before push:

1. Confirm worktree cleanliness and final HEAD.
2. Fetch the current remote branch head.
3. Push with force-with-lease when history was rewritten.
4. Record source tag, target tag, kept/dropped/ported patch count, validation proof, runtime health, config migrations, and follow-up warnings.

Record cross-machine-safe notes in this tracked runbook or a sibling tracked note. Keep machine-local state in `.agents/local/PROJECT_NOTES.md`.
