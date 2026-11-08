# Instance operands, casts and box payloads carry a numeric record (2026-11-08)

Step 5. Follows `2026-11-08-numeric-operand-records.md` (#6840), which left 1,707 instance
operands at `no record`, and `2026-11-08-numeric-pair-table-kind.md` (#6822), which named casts
and payloads as the next recorders.

## The records

- **Instance operands.** An elaboration re-checks an instance under `inferQuiet`, and
  `binRetTy` stamped operands only outside it. It now also stamps where `elabCapLive()`, so an
  un-annotated parameter given `f64` by a value call, or a `T` instanced at `i64`, records its
  pair in `elabCapNumPair`, at the type the instance gives it.
- **Casts.** `checkCastNode` stamps the operand at the kind the lowering stages it in
  (`numCastStamp`): `as%` at `i64` where either side is `i64`; otherwise an `f64` target at
  `f64`, an `i32` source at the target (`i64` at the `u8` domain), and any other number at its
  own kind. The exact and the plain lowering stage at the same kind for every pair, so one rule
  serves both.
- **Box payloads.** A delivery into a union or nullable that holds the value's wide number
  (`i64`, `f64`, `f32`) records the identity pair (`numUnionIdentityOf`, in `numPairStamp`).
  Before, a non-wide destination stored nothing, and 11,617 payloads were identity pairs.
- **Dispatch arms.** `ftBuildArmsAt` types each arm of a call through a tagged function set at
  the member's result and delivers it at the call's joined result. It now records that pair too
  (`numDeliverStamp`).

## Shadow (`run.sh`, sweep population)

| | master `24779b5f` | this PR |
|---|---|---|
| table | 309,416 | 333,638 |
| floor: no record | 25,403 | 1,181 |
| floor: src differs | 20,429 | 20,428 |
| floor: dst differs | 1 | 2 |
| `emitBinOperandAs` no record | 1,711 | 36 |
| casts (`emitNumExactCastFrom`, `emitNumPlainCast`, `emitNumWrapCast`) no record | 9,800 | 15 |
| `emitCoerceAtomPayload` no record | 11,667 | 385 |
| `emitFnTagDispatch` no record | 1,904 | 474 |

The new `dst differs` is `3.0 as i64` (`as-cast-constant-fits.vl`): the site stages an integral
float constant at `i64`, and the record says `f64`. It is listed in `floors.tsv`. Three floors
are retired from it: `emitBinOperandAs` `src differs`, and `emitCoalesceScalarDefault` and
`emitF64RemCall` at `no record`.

## The classes that stand

- **`emitBinOperandAs`, 36.** An integer `match` lowered to `scrut == pat` (`matchLower`): a
  trace in `binRetTy` fires on a hand-written `x == B` and never on the lowered compare, so no
  operator check stamps it (11, in 4 files). A compound `xs[i] += v` over a list whose element a
  later `push` pins: the read is typed only after the operator's check (22, in 2 files). Three
  more, one each in `const-kept-tree-read-at-each-width.vl`, `numeric-join-binds-the-wider-use.vl`
  and `hole-fn-set-call-result-read-at-instance.vl`, are not yet classed.
- **`emitFnTagDispatch`, 474.** The arms of a set of hole functions. The call's joined result is
  a hole at the check and a number only in the instance.
- **`emitCoerceAtomPayload`, 385, in 251 files.** 50 are converting pairs, an `i32` or `f32`
  boxed into a union at a member the box picks. 335 are identity pairs at a node with no union
  delivery stamp, or with no wide number type when it was stamped. 100 of the 251 files hold a
  `??`, whose operand joins the result and is not delivered to it (`recordJoinBoxTy` writes no
  ctx). Not yet classed further.
- **Casts, 15.** A `boolean` operand cast to a number (6, in 2 files), which is no number to the
  record. A hex literal tree widened through a tail write (6, in 3 files). D14796 and D14797 (3).

## Proof

| | |
|---|---|
| sweep, 23,696 programs, master fixpoint vs candidate | identical records: 0 `runs → not-runs`, 0 movers, 0 bytes-only |
| plumb-shape main | fuel +0.4%, peak RSS 319.8 MB (+0.6%) |
| plumb-shape tail | fuel −0.7%, peak RSS 319.5 MB (+0.6%) |
| seed | 6,558,423 bytes (+5,919 against master's fixpoint; +2.5% against the size baseline) |
| fixpoint | byte-identical on the third build |
