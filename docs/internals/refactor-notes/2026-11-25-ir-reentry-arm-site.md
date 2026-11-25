# IR re-entry `emitArmSiteAt`: an arm-site read's arms are the IR's own bodies (2026-11-25, lane COV-IS)

CENSUS's I8 rehearsal lists 22 programs failing as `reentry emitArmSiteAt`. The IR built an element,
`.length`, `.has` or `.get` read through a box of lists or maps as `RArmSite`. It lowered that
through legacy's `armSiteWrite` → `emitArmSiteAt`, whose per-arm read is `emitExpr` (or
`emitUnionCoerce`) on the read node, with the receiver overridden to the arm's unboxed payload
(`luOvEnter`). That is a re-entry from every claimed function holding such a read. The three
`reentry emitCoerceAtomPayload` programs reach that tail through the same per-arm coercion.

## What landed

- **`SArmSite`** (`ir.vl`) replaces `RArmSite`. It is a statement: `saOps` (the box, then its
  index or key), and per arm a body `saArms[k]` that reads payload variable `saVars[k]` and writes
  out `saOut`. `saIdx` is the variable an index built once is read through (Q57).
- **Builder** (`armSiteRead`, `irBArmSiteArm`): per arm, the read node is built again under
  legacy's overrides (`luOvEnter` on the receiver and the read). The receiver node reads the
  payload variable, and the index or key node reads the operand already built. Each arm's value
  is delivered at the read's rep:
  - a box: `boxTempIn` at the read's own union, as `emitUnionCoerce` boxes it;
  - a numeric literal set: `RNumWiden`, whose narrowings now lower through `numNarrowTail`
    (legacy's `emitNumRepNarrow`);
  - a string or scalar: `deliver`.
  An element union with no rep the arms deliver into is the named miss `arm site element rep`
  (`armSiteRepHolds`, the check `armSiteWrite` made).
- **Lowering** (`armSiteStmt`): the index stash, then the receiver stash (or the name's local).
  Then, per arm, legacy's tag test and payload cast (`armSiteArmOpen`, split out of
  `emitArmSiteAt` byte-neutral) and the arm's body under the same overrides (`armSiteArmEnter`).
  `unreachable` follows the last arm. The out waits on the stack, as a valued `if`'s does.
- **Order**:
  - The builder's valued-`if` predicates (`valuedIfFrom`, `valuedIfOut`, `writesInPlaceFrom`,
    `ifBelowLeadHas`, `pushStage`) count an `SArmSite`, so an earlier operand is staged below it
    (`RStage`), or a box or `??` over it is the named miss valued `if`s already have.
  - An inner chain that is an outer stashed arm site's box takes the outer's receiver stash first,
    as legacy does.
- **Rows**: the chain banks one element-read row. An element-read receiver, read as an arm's
  payload, banks its own row, as legacy's `emitIndexBanked` does over the overridden read.
- **Read-rep memo**: `readRepOf`'s memo is keyed by node and function, not by the per-arm override.
  An answer recorded inside an arm made the box read as the arm's list after it: the order check
  found a build after legacy missing `index none` where the build before claimed. Entering and
  leaving an arm (`armSiteArmEnter`/`Leave`, `irBArmSiteArm`) advances the memo.
- **Legacy**:
  - `armSiteWrite`'s operand state (`armIdxNode`/`Local`/`Imm`, `emitArmIdx`, `ARM_IDX_*`) existed
    only for the IR, so it is removed, and `armSiteWrite` is private again. `emitIdxIndex` stays a
    function, since the I8 sweep names it as a cause.
  - `armSiteWrite` and `emitArmSiteAt` leave `scripts/ir-i8-census/keep.txt`: nothing in an
    `ir*.vl` file reaches them now.

## How it was measured

The probe compiler (`emitFail("REENTRY <tail>")` at the top of each re-entry tail) was run over
the 32 rehearsal programs whose cause is `emitArmSiteAt`, `emitCoerceAtomPayload` or
`emitDelivered`. Base is master `56de706a9` with the probe.

| measure | base | head |
|---|---|---|
| `REENTRY` rows | 118 (59 functions, all `emitArmSiteAt`) | 0 |
| functions claimed | 193 | 245 |
| functions unclaimed | 62 | 10 |

Head's 10 unclaimed functions, all named misses:

- 3 were already unclaimed on base: `expression as`, `closure argument box`, `arm site operand`.
- 6 are the valued-`if` class, which the claim reached only through the re-entry: `box of a valued
  if` (3) and `coalesce of a valued if` (3). They are a `+ 0.0`, a concat, an interpolation or a
  `??` over the chain, where legacy writes the box tag or the operand around the chain in place.
- 1 is `map get rep`: a `??` over an arm-site map read of a nullable value (`narrowed-map-union-
  through-a-call-length-has-and-index.vl` `g`).

Under the byte compare (`VL_IR_SHADOW=2`), every claimed function in the 32 matches, except those
`scripts/ir-divergence-baseline.txt` lists (Q57's hoisted index). `argUnion` leaves that list,
since it is now a named miss.

Position sweeps (Q58): `unions/arm-site-hoisted-index-positions.vl` and
`unions/arm-site-narrowed-receiver-positions.vl` already deliver the read at a scalar and a union
argument, a nested call, a concat, an interpolation, a return, a `let`, an `if` arm, a `??` and a
record field. `arrays/is-list-arm-read-at-numeric-literal-set.vl` covers the literal-set arms.

## The I8 sweep (`scripts/ir-i8-sweep.sh`, every population, `--grow`)

- `keep.txt` loses 19 tails only the arm-site re-entry reached: `armSiteWrite`, `emitArmSiteAt`,
  the `emitUnionCoerce` family, `emitCoerceAtomPayload`, and the map-key writers through
  `pushMapRecvRef`. `--grow` re-added none of them. It added `arrLitDataElemExpr` (ir-tail) and
  `emitInstMapReadIsNull` (ir-sentinel).
- Causes go from 14 to 11: `reentry emitArmSiteAt`, `reentry emitCoerceAtomPayload` and
  `reentry pushMapRecvRef` leave. `reentry arrLitDataElemEmit` is now spelled
  `reentry arrLitDataElemExpr`: #10058 moved that re-entry into the new function, so it is the
  same cause.
- Static edges go from 55 to 33.
