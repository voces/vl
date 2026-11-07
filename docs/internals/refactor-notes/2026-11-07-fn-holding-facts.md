# The closed type of a function-holding value, as an elaboration fact (2026-11-07)

Producer half of the §3.4 node-type rows that waited on Fn#d: `monoPinReturnedObj`,
`monoClosedObjLitTy`, `monoRetFnListTy` and `monoCloseRetFnTy` each derive the closed type of a
value holding functions. `elabHeldValTy(x, fnIx)` (`compiler/emit_elab.vl`) answers it at the
instance, in this order:

1. `identity`: `elabIdentityTy` where it is already closed;
2. `retslot`: for a value `fnIx` returns, or a literal nested in one, `fnIx`'s return slot fact
   (`elabSlotTyAt`) at the literal's path;
3. `calleeslot`: for a call, its callee's return slot fact;
4. `calldst`: in a frame no instance keys, the one closed type every call of `fnIx` is delivered
   to (`callDstTyOf`, else the slot fact of the un-annotated `let` the call initialises);
5. `heldset` / `heldsetprog`: `elabHeldClosedTyAt` over the value, in the frame's instance and
   then the program's;
6. `leafid`: in an instance frame, each leaf's identity type, a function leaf at the one
   signature the program instances its set at (`elabHeldIdTy`).

Nothing calls it yet; the consumer switch is the orchestrator's. Generated modules are
byte-identical (5,244 programs, base seed against the fixpoint).

## Shadow

`scripts/fn-fact-shadow/run.sh`, one line per decision over 23,450 programs (tests/cases, the
distilled corpus, both inventories' witnesses):

| tag | agree | differ | old-only | new-only | closed | none |
|---|---|---|---|---|---|---|
| `retobj` (`monoPinReturnedObj`) | 2 | 0 | 0 | 54 | 282 | 46 |
| `objlit` (`monoClosedObjLitTy`, nested) | 0 | 0 | 0 | 4 | 0 | 0 |
| `retlist` (`monoRetFnListTy`) | 15 | 0 | 2 | 73 | 7 | 9 |
| `retcall` (`monoCloseRetFnTy`) | 2 | 0 | 0 | 0 | 0 | 0 |

No decision mints a late elaboration key. Mono answers 21 of these 496 decisions; the reader
answers 19 of them identically and 439 in all.

Two old-only classes the first draft had are closed by rules 4 and 6: a returned generic list
bound at an annotated destination (`generic-list-returned-to-annotated.vl`, D4575), and a hole
function list built in an instance and called outside it (D9552,
`hole-fn-list-returned-inline-call.vl`).

## What the fact cannot state

`container-of-generic-flow-reads.vl` L39/L40 (D4515): `pickList` returns `[id]` and the result is
read at `i32` and at `string`. Mono pins the literal at the first read and delivers the other
read apart. No closed type of the value exists; what a consumer needs there is the per-read
instance (`elabValueInstKey`), and the reader declines.

The 46 + 9 `none` decisions are the same shape (a field or element called at two types, or
written with a second function) or a set whose members disagree (`d15221_slice_half`); mono
declines them too.

## For the switch

`new-only` (131 decisions) is where the switch moves output: mono records nothing there today.
`closed` (289) is not a decision either way. Witnesses: `retslot` D15207, `calldst` D15274,
`heldset` D15366 and D15296, `heldsetprog` D15293, `leafid`
`hole-fn-list-returned-read-at-two-types.vl` L82, nested `objlit` `d15221_opt_dbl`.
