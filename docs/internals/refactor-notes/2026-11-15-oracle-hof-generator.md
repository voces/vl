# The oracle's third generator: generics and higher-order code (2026-11-15)

`scripts/oracle/gen_hof.ts` generates well-typed programs on the axis today's clause-1 families
live on. `scripts/oracle/fuzz.sh --gen hof` runs it, and `--gen all` (fuzz-sweep's `oracle` leg)
includes it. Its programs exercise:

- un-annotated (hole) functions and a generic `gid<A>` called directly at two types;
- both kinds handed to `app`, `twice`, `mapL`, `compose`, a hole `hcall`, and `sel<A>(f: (x: A) => A)`
  at an annotated `const` and an annotated parameter;
- re-pointed `let`s of generic or hole functions (S2.5);
- lists, records and maps of closures, and closures over a `let` re-written before the call;
- declaration order: each library function and helper goes before or after the statements at
  random, so every program declares some callee after its use.

`--stmts 1` makes each statement a program, and its `// case N` line names the failing case;
`--omit a,b` leaves cases out to look past a filed family.

**Measured** on master `33ef972d7`'s seed:

| run | programs | AGREE | COMPILED-BAD | DISAGREE / UNSOUND |
| --- | --- | --- | --- | --- |
| seeds 1-5, multi-statement, cases 0-11 | 1000 | 513 | 487 | 0 |
| seed 11, `--stmts 1`, cases 0-13 | 1500 | 1167 | 333 | 0 |
| seed 3, multi-statement, `--omit 7,8` | 600 | 600 | 0 | 0 |

There are no disagreements: every program that built printed what the oracle printed. All the
failures are COMPILED-BAD, a check-clean program that does not build or traps. They come from
four cases, and each reduces to one family:

- [D16410](../inventory/D16410.md), clause 1, loads then traps:
  `const k: (x: f64) => f64 = sel(gid)` delivers `gid`'s `i32` instance. It traps at `f64`,
  `i64` and `string`, and the `i32` cells run.
- [D16411](../inventory/D16411.md): the same with no destination, `sel(gid)(1.5)` and
  `compose(gid, gid)(1.5)`, refused at emit.
- [D16412](../inventory/D16412.md): a hole function at such a parameter is refused at
  monomorphization at every type.
- [D16413](../inventory/D16413.md): a generic declared after a call whose result wraps `B`
  (`mapL`'s `B[]`) builds invalid wasm. The only declaration-order family the run found.

Once cases 7 and 8 are omitted, every multi-statement program agrees. The other ten cases are a
negative result at this depth: hole functions at two types, re-pointed lets, collections of
closures, captured lets, and random declaration order.
