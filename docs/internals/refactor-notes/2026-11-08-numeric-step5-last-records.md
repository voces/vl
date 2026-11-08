# Step 5's last numeric records: the 117 take the table (2026-11-08)

Step 5. Follows `2026-11-08-numeric-no-record-classes.md` (#6869), which classed the 223 numeric
no-record deliveries outside `emitFnTagDispatch` by ablation and left 117 as step 5's own.

## The records

Each is written where the delivery is decided. A pass that mints nodes after the checker records
them itself, because no checker pair can exist for a node the checker never saw.

| class (#6869) | n | where the record is written |
|---|---|---|
| get-or-default read (`$nv`/`$np` split) | 43 | `nssRewrite`: the `??`, its default `if`, both zeros, the coalesce's `$nv` read |
| captured-union closure write | 19 | `cboxYieldTail`: the literal copy, the `__cbv` store and yield; `cboxYieldAs`'s casts through `numCastStamp`; the spill's re-built literal |
| push into an open list | 18 | `.push`'s pin of the element: `numSlotStamp` |
| set into an open map | 8 | `.set`'s pin of the value and of the key: `numSlotStamp` |
| operator or getter receiver | 8 | `drwOpDeclCall` (each argument at its parameter); `getterReadTy` (`self`, a brand read at its base) |
| extern function value | 6 | `synthExternValueFn`: the body's call at the extern's result |
| literal-union element | 5 | `binOperandsStamp`: a number combined with a union is read at its own kind (#6869 did `==`) |
| boolean cast source | 4 | `numCastStamp`: a boolean is cast from its `i32` |
| labelled block with no `break` | 3 | the loop-value rewrite: the carrier's minted zero |
| nested else-if join | 2 | `numInnerJoinsStamp`: an inner join typed a wide number, under a union outer join |
| `??` literal-union hit | 1 | `numBoxedStamp` at a wide-number join, where no pair stands |

Three classes outside the 117 shrank with them. The map-read split and the cbox rewrite also serve
hole and generic code, and the cbox yield is where a closure write's hex width is built. The `??`
chain's re-associated inner link takes a record at the outer link's type.

## Shadow and floors (`run.sh`, sweep population, fixpoint seeds)

| | base (master `7924d36d` + #6869) | this PR |
|---|---|---|
| num no record, all positions | 697 | 534 |
| of which outside `emitFnTagDispatch` | 223 | 60 |
| num table | 334,202 | 334,368 |
| num src differs / dst differs | 20,346 / 2 | 20,343 / 2 |
| num `floor: never returns` | 8 | 8 |
| `floors.tsv` rows | 55 | 46 |

Nine `num floor: no record` rows leave `floors.tsv` because nothing reaches them any more. They are
at `emitDirectCallArgsUnder`, `emitLetInitValue`, `emitMapGetOrUnionBox`, `emitNumExactCastFrom`,
`emitNumPlainCast`, `emitNumWrapCast`, `emitPushValue`, `emitScalarValue` and `njStash`. The sweep
shows all 23,707 programs byte-identical. A record serves a delivery only where it names the pair
the site already lowers, so a record that named a different pair would read as a floor, not as a
new lowering.

## What stands, 60

**Step 2, 48.** Re-measure these when step 2 lands.

| class | n | witness file |
|---|---|---|
| a hole function's call result | 34 | `inventory/D14428.vl`, `closures/written-let-of-hole-fns-*` |
| a hole-typed value | 7 | `functions/forwarder-literal-adapts-to-callee-param.vl` |
| a type-parameter value | 5 | `closures/typaram-let-copy-closure-written-in-record.vl` |
| a generic instance's own nodes | 2 | `generics/value-join-at-the-pin.vl` |

**Site-owned, 12.** The site mints the value at the width it delivers.

| class | n | witness file |
|---|---|---|
| `??` integer default minted at the wide arm | 8 | `inventory/D3516.vl`, `unions/coalesce-numeric-union-widens.vl` |
| hex literal width at a value `if` | 2 | `literals/hex-width-through-value-if.vl` |
| literal tree at a wide destination | 2 | `literals/literal-tree-width-at-destination.vl` |

The 474 `emitFnTagDispatch` hole-fn-set arms are unchanged and wait on step 2.

## Step 5 against its done criterion

Step 5's own records are written: 117 → 0. Every numeric delivery outside step 2 now reads the
table, or it is one of the 12 site-owned rows or the 8 `never returns` rows, and each of those has
its reason recorded. Step 5 is done apart from the named step-2 classes: 48 rows and the 474 arms.
