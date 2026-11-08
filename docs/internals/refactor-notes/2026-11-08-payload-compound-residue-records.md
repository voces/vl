# Atom payloads, `+=` on a list pinned later, and the atom residues take the table (2026-11-08)

Step 5. Follows `2026-11-08-read-side-atom-arm-floors.md` (#6861), which left
`emitCoerceAtomPayload` 385 no-record, `emitBinOperandAs` 26 (22 of them `xs[i] += v`), and 3
atom floors.

## What each floor lacked, and the record that serves it

| floor (deliveries) | what it lacked | record now |
|---|---|---|
| payload into a union with an alias member (`f64` into `Json \| JsonError`) | `numUnionIdentityOf` read only the top members, so an alias's `f64` leaf was invisible | the union's flattened leaves (`flattenVariantsInto`) |
| payload of a literal or literal-union value (`6000000000` into `L \| null`) | `numKindOfTy` of a `TyLit` is 0 | `numBaseKindOfTy` peels to the base, as an operand's type does |
| an `i32` into a union whose only numeric arm is `i64`/`f64`/`f32`; an `f32` into an `f64`-only one | only identity pairs into a union were recorded | `numUnionPairOf`: the union's own promotion, `unionStoreAtomKindOfSet`'s ladder |
| a `??` left operand's hit boxed into the join | the join had a box record and no numeric pair | `numBoxedStamp` at the hit value (the map's stored value where it reads one) |
| a value loop's `break v` exits | `boxExitsStamp` stamped only the box | `numBoxedStamp` per exit |
| a `?.` call's or read's minted non-null part | never checked, so no type | `numBoxedStamp` at the read's type without `null` |
| `xs[i] += v` over a list a later statement pins (operands, and the store's value) | the read node is never typed: its own store pins the row mid-check, so the open-read bank skips it | the operand reads the pinned row's element (`numOperandTyOrRow`); the store stamps its value at it (`numDeliverStamp`) |
| atom: a closure tail `k = W`, `W` a `const` read typed `string` (`captured-litunion-assign.vl`) | the assignment's own type is its right side's | `asgValueSetTy`: the target's set |

## Shadow (`run.sh`, sweep population, fixpoint seeds, each over its own `compiler/`)

| | master `b030ab5f` | this PR |
|---|---|---|
| `emitCoerceAtomPayload` no record / src differs | 385 / 117 | 8 / 35 |
| `emitBinOperandAs` / `emitIdxStoreValue` no record | 26 / 35 | 4 / 7 |
| num no record, all positions | 1,171 | 727 |
| num table | 333,654 | 334,180 |
| num src differs / dst differs | 20,428 / 2 | 20,346 / 2 |
| atom floor / atom table | 3 / 1,260 | 2 / 1,261 |
| arm table / floor | 33 / 0 | same |
| `floors.tsv` rows | 58 | 56 |

Two rows leave `floors.tsv`: `emitReturnCoercedValue` atom no record and `emitStartGlobalInit`
num no record (3 on master), both now recorded. Every movement is floor → table at an agreeing pair;
the sweep shows all 23,704 programs byte-identical.

## What stands at the lane's positions

- **Payload, 8.** Three are a `??` default literal the site mints at `i64` beside an `i32` arm
  (`coalesce-numeric-union-widens.vl`): site-owned, the class `src differs` already names. Five
  are a join whose member only the pin names (`T | i32` at `f64`, a type-parameter `??`, a value
  `if` over `T`, a `null` hole filled later): step 2.
- **Payload src differs, 35.** An integer literal the site builds at the `i64`/`f64` arm it boxes
  into, where the checker records `i32` to that arm. Same value, site-owned.
- **`+=`: 0.** The four `emitBinOperandAs` and seven `emitIdxStoreValue` left are hex/literal
  widths a site mints, hole functions, and a generic join.
- **Atom, 2.** Both are `coalesce-join-tag-in-instance.vl`: an un-annotated parameter's call
  result set. Annotating the parameter puts it on the table, so the set is the hole instance's:
  step 2.

## Step 5 against its done criterion

Not met yet. Apart from `emitFnTagDispatch`'s 474 (step 2), 253 numeric no-record deliveries
stand at 18 positions, unnamed. Sampled: hole functions and hole callees (`written-let-of-hole-fns`,
`hole-callee-push`, a hole `??` join), closure writes into a captured union
(`capture-union-closure-write-*`), a union `==` against a literal arm (`emitUnionEqOther` 19),
labelled-block joins (`emitBlockValueAsGo` 39), and `get`-or-default reads. The hole share is step
2; the rest is record work not yet scheduled.
