# L2 S0, parts 3 and 4: the shadow-interface printer and its differential, 2026-11-15

Lane G. This is S0's instrument (`l2-inferred-interfaces-design.md` §8). Its two go/no-go
measurements are the part 1 and part 2 notes (`2026-11-15-g76-…`, `2026-11-15-g77-…`). Measured at
master `5e45620f`, plus this branch.

## What it is

- **`compiler/check_iface_shadow.vl`.** `ifaceDumpBuild()` builds a text dump from the tables the
  last check left; `ifaceDumpAt(i)` reads it a code point at a time. It is built only when the host
  asks, so an ordinary compile does no extra work. It reads indices only (`fnDeclIx` and the
  call-binding rows), so it adds no whole-arena scan.
- **One line per un-annotated top-level function.** It holds:
  - the parameters as named scheme variables, and the result;
  - the demand rows the function owns, per table: `bin=`, `arg=`, `ret=`, `let=`, `bm=`, `mem=`,
    `ufcs=`, `is=`, `print=`, `arrdef=` and `nest=`;
  - the `HD_*` kinds rooted at its parameters (`hd<kind>=`);
  - the differential: `calls=`, then `differ=` with up to three `differ@<node>{<substituted>|<recorded>}`.
- **The differential's two sides.** "Substituted" is the declared result substituted at the call's
  binding row (`callBindNamesAt`/`callBindTysAt`, asked quietly). "Recorded" is the type the checker
  gave the call.
- **Host: `$VL_IFACES=1`.** After `vl build`, `vl run` and `vl check --codegen`, the host prints each
  line as `[iface] <path>: …` on stderr. It is a bypass variable in `compile_cache.rs`: it observes a
  compile, so it never serves from the cache.

```
VL_IFACES=1 vl check --codegen <file> --compiler build/vl-compiler.wasm
[iface] t.vl: fn get('?get.0) -> '?fld.x.?get.0 hd0=1 calls=1 differ=0
[iface] t.vl: fn sum('?sum.0) -> '?it1.?sum.0 bin=1 let=2 hd13=1 hd14=1 calls=2 differ=0
```

`tests/vl_ifaces_test.ts` pins the row's shape. It also checks that an unarmed compile and a program
with no un-annotated function print nothing.

## Grading

The population is part 2's: the 1,464 `@run` programs with an un-annotated function, each built with
`VL_IFACES=1`. 1,359 of them build, giving 4,680 function lines and 5,317 graded calls.
"Covered" is part 2's program-level set of 833 programs, of which 751 have lines.

| population | functions | calls | calls that differ | functions with a differing call |
|---|---:|---:|---:|---:|
| covered | 1,987 | 2,319 | 40 (1.7%) | 19 (1.0%) |
| uncovered | 2,693 | 2,998 | 73 (2.4%) | 51 (1.9%) |
| all | 4,680 | 5,317 | 113 (2.1%) | 70 (1.5%) |

Every differing call is function-valued. Of the 100 listed (at most three per function):
- **88** leave a hole in the substituted result. Either a hole function parameter's call result
  (`?ret.?lap.0` stays `_` against `string`), or a record of functions bound where a function was
  expected.
- **12** are a function-set join. The recorded result is the set's (`void | i32`, or `f64` for an
  `i32` member of a written `let`), and one member's scheme does not predict it.

## A correction to part 2

The 19 covered functions with a differing call are set and bundle calls. Their decisions live in
`check_fn_tag.vl` (`fnTagDecide`), whose functions are not named `hole*`, so part 2's probe did not
count them. Function-set decisions belong to family group 1, function-valued holes, whose true count
is above part 2's figure. Each family PR measures with `fnTag*` included.

## Commands

```
VL_IFACES=1 vl build <file> --compiler build/vl-compiler.wasm -o <out>.wasm 2>&1 | grep '^\[iface\]'
```

The grading groups the rows by part 2's covered set, then counts `calls=` and `differ=` per
population. The mismatches are classed by whether the substituted side still holds `_`, or whether
the recorded side is a union containing it.

## Lines

- The compiler module and the `entry.vl` export: +180.
- The host: +37.
- The test: +70.
- The seed grows 6,468,881 → 6,474,330 bytes (+0.08%).
