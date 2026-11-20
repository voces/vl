# The claims gate compares refusals (2026-11-20, lane IR4)

IR-REV's refusal-bypass census found that `ir-identity.sh --cases` could not see one class
([D17006](../inventory/D17006.md)'s): a legacy refusal that a claim turns into a build.

## What `--cases` compares now

- **A program that fails under both seeds** used to count as `fail under both` on its exit code
  alone. Its first diagnostic line (`path:line:col: message`, else the log's first line) is now
  compared as well. This costs no extra build.
- **Every `@error` program in tests/cases** (1,327) is now built under both seeds. Each is
  compared on its exit code and first diagnostic line (`errors: same N, differ N`).
- The two-seed mode (`<seed-a> <seed-b>`) still compares exit codes only. There a PR may reword
  a refusal on purpose.

## Where the guard has a population

- **The fail-under-both rows (68 today).** Several are emit refusals (`emitProgram: …`, for
  example `a generic function taken as a value reaches no call that fixes its …`). This is where
  a claim can change a refusal.
- **The `@error` programs.** Every one of the 1,327 is refused by the checker: 0 pass
  `vl check`. A claim acts only at emit, so on today's tree this leg guards a population that
  claims cannot reach. It costs +1 min 28 s wall at `JOBS=4` (`--cases` went from 3 min 33 s to
  5 min 0 s, and CPU rose by about 4 min). It earns its place only if an emit-stage `@error`
  case is added.
- **D17006's own repro** is an inventory row, not a tests/cases program, so `--cases` still does
  not build it.

## Measured

| | result |
|---|---|
| `--cases` on master 585f51b42 | `cases: identical 7516, fail under both 68, differ 0`; `errors: same 1327, differ 0` |
| control (`tests/vl_ir_identity_compare_test.ts`) | an injected bypass reds under `--compare` and `--compare-errors`, both a refusal that builds and a refusal that changes; the untouched builds pass |

**Lines: scripts +55 / −5, tests +98.**
