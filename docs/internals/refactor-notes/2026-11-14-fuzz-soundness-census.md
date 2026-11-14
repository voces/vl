# Fuzz-sweep soundness census: 16 unsound findings, four clause-1 families, all bucket (f), 2026-11-14

Lane B. This note changes no compiler code. It files four rows, D16310–D16313, and adds the named set
`fuzz-2026-11-14` (15 cells) so `regress.vl` holds every family's witness and the spellings that run
beside it.

## What was run

- `scripts/fuzz-sweep.sh`, the local replacement for the retired `fuzz-nightly` cron. It runs the
  same four legs as the workflow: `plain` (the gating grammar), `branching`, `multiobs` and
  `declared` (the report-only surveys).
- Two sweeps on a master fixpoint seed (`58c5e37b1`; every witness re-checked on `fe9585a72`): 10 and then 40
  fresh seeds per leg, 200 programs each, depths 4 5 6. That is **40,000 programs**.
- The baseline `scripts/rep-fuzz-baseline.txt` holds no shape, so nothing was suppressed.

## The rate

- **16 unsound findings in 40,000 programs, about 1 per 2,500.** 8 are invalid wasm, 4 traps and 4
  silent mismatches.
- The workflow's "about 1 per 200" comes from the July 2026 audit, and today's compiler does not
  bear it out.
- Per leg:

| leg | findings |
| --- | --- |
| `plain` | 4 in 10,000 |
| `branching` | 7 in 10,000 |
| `multiobs` | 4 in 10,000 |
| `declared` | 1 in 10,000 |

- The REJECT tail is clause 2 and outside this census: about 70 REJECT findings across the two sweeps.

## Is the oracle trustworthy

**Yes.** The generator (`scripts/fuzzgen.vl`) buries a literal payload in a randomly nested rep
and writes `// @log <payload>` itself. The expected stdout is the payload text, computed by no
part of the compiler. `scripts/fuzz-vl.sh` sorts each case by what it observes:
- **INVALID-WASM:** the validator's own rejection.
- **TRAP:** a runtime trap.
- **MISMATCH:** stdout differs from `@log`.
- **REJECT:** a check, parse or emit refusal.

Every program is `vl check`-clean, so every non-REJECT finding is clause 1.

**One caveat:** the oracle states the generator's reading of the program's types. For each
MISMATCH I confirmed that reading against the compiler's own. The annotated or unparenthesised
spelling of the same program prints the `@log` value, so the expectation is the language's, not a
generator mistake.

## Families, by ablation

| family | row | mechanism (the ingredient whose change makes it run) | findings | bucket |
| --- | --- | --- | --- | --- |
| A | D16310 | an un-annotated lambda delivered to a closed function type builds its result at its body's type; annotating the result runs | 9 | (f) |
| B | D16311 | an all-`null` list literal at a `(boolean \| null)[]` record field is built at `nullref` where the field stores the `i32` niche | 2 | (f) |
| C | D16312 | an element read of a list of a nullable union with a ref member, in a function, binds a non-null box local | 2 | (f) |
| D | D16313 | a parenthesised list literal at a literal-union list member is built as `string[]` | 3 | (f) |

- Family A has three faces, depending on what the two reps are:
  - invalid wasm, for a record field union or list;
  - an `indirect call type mismatch` trap, for `i32` against `i64`;
  - a silently false `is`, for a field that is a union of function types.
- All four families are clause 1, and all four are bucket (f): a local fix that no architecture
  item owns. In each, the neighbouring spelling that runs shows the mechanism already exists:
  - A: an annotated result;
  - B: a literal with a `true` in it;
  - C: the top-level read;
  - D: the unparenthesised literal.

## The findings

| sweep | leg | seed | case | class | shape | family |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | branching | 74847787 | 227 | INVALID-WASM | `p0r {f: (boolean \| null)[]}` | B |
| 1 | branching | 74847787 | 228 | INVALID-WASM | `p0c {f: (boolean \| null)[]}` | B |
| 1 | multiobs | 67910670 | 189 | TRAP | `p3r {a: i64[], f: () => i64, z: f64} \| {w: i32} \| f64` | A |
| 1 | plain | 529180686 | 255 | INVALID-WASM | `p1r (string[] \| i32 \| null)[]` | C |
| 1 | plain | 61858219 | 25 | MISMATCH | `p3r {a: f64, f: (() => boolean \| i32) \| {w: i32}, z: string} \| i64` | A |
| 2 | branching | 16508855 | 293 | TRAP | `p3r {f: {a: f64, f: (() => i64) \| null, z: i32}} \| i32` | A |
| 2 | branching | 288563329 | 361 | INVALID-WASM | `p0r () => {a: f32, f: boolean[] \| i32, z: string}` | A |
| 2 | branching | 466521755 | 177 | INVALID-WASM | `p2r () => (() => {a: f32, f: i64[] \| boolean, z: i64})` | A |
| 2 | branching | 466521755 | 178 | INVALID-WASM | `p2c () => (() => {a: f32, f: i64[] \| boolean, z: i64})` | A |
| 2 | branching | 675708567 | 43 | MISMATCH | `p2r (i32, i32, i32) => K0[] \| boolean` | D |
| 2 | declared | 40150360 | 321 | INVALID-WASM | `p3r {[string]: (i32, i32, i32) => {…, z: f64[] \| i32}} \| null` | A |
| 2 | multiobs | 255661573 | 243 | MISMATCH | `p2r (i32, i32, i32) => K0[] \| f64` | D |
| 2 | multiobs | 7956295 | 135 | TRAP | `p0r {a: …, f: () => i64, z: i64} \| boolean \| null` | A |
| 2 | multiobs | 86865150 | 1 | INVALID-WASM | `p2r ({[string]: i64} \| f64 \| null)[]` | C |
| 2 | plain | 134444621 | 279 | MISMATCH | `p0r (i32) => K0[] \| {w: i32}` | D |
| 2 | plain | 443119817 | 289 | TRAP | `p3r (() => boolean \| null)[][] \| string` | A |

To reproduce one: `scripts/fuzz-vl.sh --seed <seed> --count 200 --depth <d>`. The depth cycles
`4 5 6` over the leg's seed order. The `branching`, `multiobs` and `declared` legs add their flags,
as `scripts/fuzz-sweep.sh` does.

## Why the inventory held so few clause-1 rows

None of the four families was filed. The fuzzer's gate is the 16 frozen seeds of
`rep-fuzz-check.sh`, and these show up only on fresh seeds. The sweep that finds them runs only by
hand since the cron was retired, and its findings land in a keep directory, not in the inventory.
