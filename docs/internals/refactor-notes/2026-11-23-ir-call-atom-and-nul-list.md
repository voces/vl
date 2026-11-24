# IR: a function-value call with an atom at a string, or a list at a nullable list, 2026-11-23

Lane IR-N4. Base: master 2c93801e, which holds #9786 (batch 1), since both batches widen
`callRefArgPlain`. Batch 2 of `call of a non-declaration`: the `atomToStr` arm (4 rows) and the
nullable scalar list (4 rows).

## Change

- **Atom at a string parameter.** `emitCallRefArg`'s `atomToStr` arm is `emitAtomToStr`, the atom
  decode, which the IR already builds as `RAtomStr` (`atomToStr`). `callRefArgPlain` counts the arm
  as plain. `closureCallAt` builds the atom and decodes it at the parameter's string rep
  (`closureArgAtomStr`). The builder keeps its own named misses (`atom string source`, the nullable
  decode).
- **Scalar list at a nullable list parameter** (`f64[]` and `u8[]`, as two classes). The
  `scalarList` arm is `emitExpr`, and `emitNonNullParamRecover` writes nothing for a `nul*list`
  kind. `callRefArgPlain` takes the kind unless a narrowed arm needs unboxing. `closureCallAt`'s
  as-is check takes the list itself under the parameter's nullable (`nulListTakes`, `scalarList` arm
  only).

As in batch 1, `callRefArgPlain`'s only legacy reader is `emitCallRefArg`'s 1/0 return, which feeds
the shadow's plain-call record alone, so no legacy byte moves. The empty legacy A/B shows it.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `callRefArgPlain` (widened) | `emitCallRefArg`'s plain-call record (shadow only); `callRefPlainKey` (IR only) |
| `closureArgAtomStr` | `emitCallRefArg`'s `atomToStr` arm, through the IR's `atomToStr` (`emitAtomToStr`) |
| `nulListTakes` | `emitCallRefArg`'s `scalarList` arm |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/closure-call-atom-and-nullable-list.vl` covers:
- an atom at `string` and at `string | null`;
- `f64[]` and `u8[]` at a nullable list parameter, non-null, nullable and null, each callee reading
  `.length` or an element behind a null check.

The null cases print `-1`, so the null passed as null.

Fixpoint seeds on both sides, master 2c93801e against this branch, `VL_STD` the tree's:

| class (tests/cases census) | master | branch |
| --- | ---: | ---: |
| call of a non-declaration, functions | 27 | 19 |
| start: call of a non-declaration | 9 | 6 |
| tests/cases functions matched | 79340 | 79348 |
| tests/cases starts matched | 7007 | 7008 |

By family:
- **Atom at a string parameter:** `atom-to-nullable-string-value-call.vl`,
  `atom-forwarded-through-hole-params-to-nullable-string.vl` and
  `call-arg-rep-belongs-to-the-callee.vl` leave every row of the class. With batch 1's `nulstr`
  admission, an atom at `string | null` matches too, so nothing moves to `closure argument coercion`.
- **`f64[]` at a nullable list:** `hole-leaf-literal-through-forwarder.vl` keeps only its own
  `widen instLit` and `argument coercion` rows.
- **`u8[]` at a nullable list:** `fn-type-param-list-forces-types.vl` and
  `capture-nullable-scalar-list-tail-write.vl`'s starts move on to `expression null` (N5's).

Checks:
- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20448 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0, built under one only 0;
  self-compile identical. `--claimless`: identical 14054, differ 0. `--cases`: identical 7749, fail
  under both 68, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7462, fail under both 67, differ 0 (a build under one seed only
  counts as a differ); the moved list is empty.
- Armed shadow: 0 fail or mismatch rows on both. `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900, as master's seed does.
- Fuel: L2 123669085741 against master's 123669084337.
