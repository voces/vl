# Step 7: a hole's covered rep (group 2) and the kept delivery's row (group 8), 2026-11-10

This round starts from master `67329a97` plus #7022–#7024, where `classifier-census.vl` reads 42
probed classifiers. It covers groups 2 and 8 of `2026-11-09-step7-classifiers-remaining.md`, under
DECISIONS.md §"How step 7's classifier half finishes". It uses round 26's method: a scratch compiler
runs each classifier beside a typed twin and counts `SH` tags under `$VL_CLS_CENSUS=1` over the
23,816-program sweep population. Every count below is post-mono calls.

**Shadow.**

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `calleeRetKindOfRead` | the read's type at the instance (`nodeTyInOf`), its `$fnsig` key's result | 216,222 | 7,442 |
| `calleeReturnsStructIdxOfRead` | the same key's struct slot | 34,739 | 20 |
| `cloValueCallRetKind` | A: no `Ident` callee, a `Member` callee stored as a closure (`memberIsClosure`), and the callee's type a function; the call type's rep | 38,859 | 189 (graded at the consumers) |
| `letTailRowSlot` | B: the initializer's `listRowOfExpr`, else the literal's own row, else the element type's | 7,910 | 341 |
| `letTailRowSlot` | C: B, with `listRowOfExpr` reading a named call's instance result row | 7,941 | 5 (graded at the consumers) |
| `fieldCodeCellKind` | none: see below | | |

**What the disagreements are.**

* `cloValueCallRetKind`'s 189 are the shape test against the type test. 165 are an `Index` or `Call`
  callee whose type is not a function (an operator field such as `.[]`), where the legacy answers
  and A declines. 24 are a callee the legacy shape list excludes whose type is a function, where A
  answers. Neither caller's answer moves, as round 23 found.
* `letTailRowSlot`'s 341: 304 are D14813's two files. `keep([mkcall()])`'s type is `{ r: null }[]`,
  which keys no row, while `keep`'s instance declares `T[]` at `Circle` and returns `Circle`'s row.
  That row is the callee instance's declared result type, a typed fact. C reads it, and the
  `letRefListSlot` rung before `letTailRowSlot` answers these bindings. 23 and 5 were the literal
  arm, which B and C share with the legacy. The other 5 calls are in 4 programs, every one a list
  of function values (`[id]`, `[[inc0]]`, `fs: [inc0]`): group 3's fact, lane w254's.
* `calleeRetKindOfRead`'s 7,442, attributed by the rung that reproduces the legacy key:

  | read's type | rung | calls | files |
  | --- | --- | --- | --- |
  | function over a hole | the producer lambda's lowered key (`cloSigKeyExt`) | 5,470 | 122 |
  | not a function (an alias, a union) | producer | 675 | 63 |
  | function over a type variable | producer | 576 | 56 |
  | closed function | producer | 1 | 1 |
  | any | an un-annotated copy's source | 292 | 32 |
  | any | the instance parameter's annotation | 207 | 21 |
  | closed function | the legacy key is empty | 148 | 18 |
  | any | another rung, a capture's frame among them | 73 | 24 |

  So 6,722 of the 7,442 are the binding's producer. The checker leaves the binding's type a hole and
  binds it per call; the value it holds is the lambda the emitter lowered at one key. **That key is
  the hole's covered rep.** It is computed where the lifted lambda's signature is interned
  (`collectLiftedCloSig`), and nothing keeps it per binding. Recording it there, per binding
  declaration, lets the typed reader be the read's type when it is closed and the binding's
  recorded key when it is not. The same record answers `calleeReturnsStructIdxOfRead`. That is the
  next round. `calleeCloSigKeyOfRead`'s other rungs (narrowing, loop variable, annotation) already
  read types.
* `fieldCodeCellKind` is asked only after `readCellKind` has asked the field's recorded storage type
  and found it a hole or `nulnone` (847 calls, 438 files). It answers a nullable kind in 32 calls, at
  codes 15, 18, 20, 21, 31 and 32, and null in the rest. Those codes are written into `sFieldTypes`
  where the row is minted, and three passes rewrite a code in place afterwards (`FC_I32` and `FC_STR`
  re-lays). A second column copying the code's kind at mint would go stale at those rewrites, and it
  would hold nothing the code does not. The field code is the hole field's covered rep. So
  `fieldCodeCellKind` reads the emitter's own storage and belongs with group 1. Its `NOT_BLIND`
  move is left to the lane that moves group 1 (w257), so the two do not conflict on one list.

**Graded at the consumers.** The tree with A and C in place was compiled, every program in the
population, and compared with master's fixpoint seed. 23,812 of 23,816 give byte-identical wasm.
The 4 that differ are the function-value lists above, which the legacy `letTailRowSlot` builds and
C refuses. So `cloValueCallRetKind` switches, and `letTailRowSlot` keeps its fallback.

**Switched.**

* `listRowOfExpr` reads a named call's row from the callee instance's declared result type, where the
  call's own type keys none (`callRetListRow`). That is group 8's fact: D14813's binding takes
  `Circle`'s row from a typed reader, and `letTailRowSlot`'s calls fall 8,251 → 7,947.
* `cloValueCallRetKind` is A. It leaves the probe set. Its field gate is `memberIsClosure`, group 1.
* `letTailRowSlot` stays probed. What still reaches it is a list of function values, which follows
  `refListSlotOfExpr` (group 3).

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master | 42 | 42 | 0 | 0 | 0 | 0 |
| this PR | 41 | 41 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds (two `refresh-compiler.sh` runs, byte-identical). Master is
6,597,010 bytes and this PR is 6,597,370 (+360). Late demands are 6, the baseline.
