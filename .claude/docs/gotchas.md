# Gotchas

## 2026-07-17 — Tooling migration (husky→lefthook, biome→oxlint+oxfmt)

- **lefthook `skip_empty` is gone.** Not a valid key in lefthook v2 schema — silently ignored, stripped by `lefthook dump`. Don't use it.
- **lefthook pre-push skips when nothing to push.** It computes `push_files` = commits in local branch not in the remote tracking ref (`origin/main`). If HEAD == origin/main, all pre-push commands skip with "no matching push files" — this is correct. On a real push of new commits, `test`/`audit` run. `lefthook run pre-push` (manual) always shows the skip because it has no push range. To test a real push locally: `git update-ref refs/remotes/origin/main HEAD~2` → `lefthook run pre-push` → restore ref.
- **oxfmt formats the whole repo by default** (md, yml, json, ts). Biome here was scoped to TS only. Scope oxfmt via explicit paths in scripts: `oxfmt src tests vitest.config.ts` (not bare `oxfmt`), else docs/*.md etc. get reformatted.
- **oxlint enables only `correctness` by default.** Biome `recommended` enforced `no-explicit-any`/`no-non-null-assertion`; these are NOT on by default in oxlint — enable explicitly in `.oxlintrc.json` (with `typescript/` plugin prefix) or you silently lose enforcement.
- **oxlint disable directive:** `// oxlint-disable-next-line <eslint-rule-name>` (e.g. `no-control-regex`, the equivalent of biome's `noControlCharactersInRegex`).
- **`pnpm ci` ≠ `pnpm run ci`.** `pnpm ci` hits pnpm's reserved (unimplemented) command. Use `pnpm run ci`.
- **`prepare: lefthook install`** installs hooks into `.git/hooks`. husky had set `git config core.hooksPath .husky/_` — unset it (`git config --unset core.hooksPath`) or git ignores lefthook's hooks.
- **pnpm@9.0.0 pin has many CVEs** (`packageManager` field + CI `pnpm/action-setup`). Bump both together when convenient; audit-ci (`pnpm audit`) does NOT catch this (it audits deps, not the pnpm binary).
