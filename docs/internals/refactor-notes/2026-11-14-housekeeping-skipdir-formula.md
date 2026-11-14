# Housekeeping: the CLI walk skips only deps and git; the Homebrew draft is gone; editor suites fail on a missing seed, 2026-11-14

Lane B, three owner-ruled items. Net compiler lines: +3 / −5 (−2). Pin-helper delta: 0.

## `cliSkipDir` (compiler/cli_util.vl)

- `vl check`, `vl fmt` and `vl test` over a directory now skip only `node_modules` and `.git`. They
  used to skip `dist` and `reference` as well. `reference` was scaffolding for the deleted
  `reference/` TypeScript interpreter, and `dist` hid a user's own directory of that name.
- No repo script relied on either skip. The tree tracks neither directory. The only `dist`
  directories that exist are gitignored build output (`dist/`, `lsp/dist/`), and they hold no
  `.vl` files, so no caller needed `--exclude`.
- Seed: fixpoint on both sides. The new seed is 6,827,999 bytes, against master's 6,828,127
  (−128). With global numbers masked, the `wasm-dis` diff has three parts:
  - two string globals, of length 4 and 9, are gone;
  - `cliSkipDir`'s body is two `__str_eq__` arms shorter;
  - the string-initialisation function's `__str_fill__` chain loses the same two literals, which
    shifts the later data offsets.
- `tests/vl_check_dir_test.ts` gains a step: a user's `reference/bad.vl` and `dist/bad.vl` are both
  checked (exit 1, both named), and `--exclude reference --exclude dist` drops them.
- Not changed: `lsp/src/moduleGraph.ts` `SKIP_DIRS` still lists `dist` and `reference` for the
  LSP's capped find-references crawl (`MAX_DISK_FILES`). That crawl has its own contract.

## `Formula/vl.rb`

- The file is deleted. `release.yml` keeps its build and checksum steps. Its header no longer
  promises a formula bump, and the commented `TODO(release)` publish block is removed.
- ROADMAP.md's backlog gains "Homebrew formula, once a release process exists", and C5 is
  restated without the formula.

## The editor suites under `SELFHOST_NATIVE_ALIGN=1`

- None of the 38 suites in ci.yml's "Editor features on the wasm compiler" step read the flag.
  Each one had its own copy of a `Deno.statSync(SEED)` block and skipped when the seed was missing,
  so setting the flag on the step alone would have changed nothing.
- `tests/support/tree.ts` now has `seedPresent(p)`, and all 38 suites call it. On a fresh clone it
  still returns false, so the suite skips. Under the flag, a missing seed throws at module load.
  The step now sets the flag.
- `tests/ci_seed_coverage_test.ts` previously recognised a seed-backed test by the strings
  `statSync` or `exists(`, and would have stopped seeing all 38 suites. It now also recognises
  `seedPresent(`.
- Control: `lsp_utf16_columns_test.ts` with no seed fails under the flag ("SELFHOST_NATIVE_ALIGN=1
  but the seed is missing: …") and skips without it (1 passed, 7 ignored). With the seed, the 38
  suites pass (439 tests).
