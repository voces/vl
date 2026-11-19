# IR re-entry: the `??` default's helper constant (2026-11-19, lane IR4)

§10.1 stage 2. Both the IR builder (`mapGetOr`) and its lowering ask legacy's `mapGetOrHelperRoute`
whether `g[k] ?? d` reads through `__map_get_<row>__` with `d` as the miss constant. To find that
constant, `mapGetOrHelperMiss` wrote the default into a scratch buffer through
`emitMonoMapDefault` → `emitExpr`, and read back a lone `i32.const`. That is legacy's expression
writer running inside the IR's claim path (and at build time).

## What changed

`mapDefaultI32Of(defIx, fnIx)` reads the constant off the literal. It recognises the two spellings
that `emitExpr` writes as one `i32.const`:
- an integer literal at width `i32` (`emitNumLitNode`: `numLitWidth`, then `numLitLexAt`);
- a literal negated at width `i32` (`emitUnaryNode`'s fold, `emitSignedNumLitAt`, at
  `numLitTyWidth`).

Any other default declines, as it did when the scratch bytes were not one `i32.const`.
`mapGetOrHelperMiss` returns its answer. Legacy and the IR both ask the same function, so they
agree by construction, and the identity diff checks it against the scratch emit it replaces. The
now-unused `slebI32At` is deleted.

## Measured

Fixpoint seeds on both sides: master cb50a11af against this branch merged with it.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,034, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,512, differ 0 |
| armed shadow / `--claims` | 31,176 matched / emitted (master 31,176) |
| mode 3 self | byte-identical, 0 fell back, 12,768 claimed |
| L2 fuel | 99,557,981,640 (+0.5% on the committed baseline, as master is) |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, `ladder-sets.vl`, phase state, late demands | clean; ok; ok; 9 = baseline |
| `deno task test` | 9,565 passed, 0 failed |

**Driver census** (`REENTRY=mapGetOrHelperRoute scripts/ir-driver-census.sh`, each seed run from
its own checkout):

| | lines leaving the claim path / drivers | reached through it |
|---|---|---|
| master | 511 / 12 | 7,081 lines, 429 drivers |
| this branch | 54 / 5 | 6,371 lines, 394 drivers |

The drivers that left are `emitExpr`, `emitMonoMapDefault`, `emitUnaryNode`, `emitNumLitNode`,
`emitSignedNumLitAt`, `emitNumLexAt`, `wNegateConstFrom`, `isOneConstIns`, `slebI32At`, and the
expression writer's entry checks (`exprReadsDeadNever`, the delivery hooks and the like). The 5
that remain are byte-free deciders: `mapGetOrHelperRoute`, `mapGetOrHelperMiss`, `mapDefaultI32Of`,
`coalWidens` and `mapRecvScalarKindInst`. They are the shared decision, and they stay.

**Lines.** −5 net (+20 / −25): the scratch emit and `slebI32At` go, and the literal reader comes in.
