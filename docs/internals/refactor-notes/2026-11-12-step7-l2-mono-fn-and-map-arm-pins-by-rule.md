# Step 7 L2 §7: a function-typed argument's pin takes the naming rule; the map-arm pin and the function nominalizer are deleted (renders 19 → 17), 2026-11-12

w324's grading of the render-parse sites (#7362) handed this lane two `emit_sig_tokens` renders
whose only callers are emit_mono's pins:

- `nominalizeFnTypeOfTy` → `nominalizePartOfTy`, whose last rung is `tyToEmitName`. It is
  called by `monoArgFnTypeName` at 3 sites: the pin name of a function-typed generic argument.
- `nodeMapArmNominalName`. It renders a whole map and cuts its key text back out. It is called by
  `monoArgTyNameRep`'s map rung.

The base is master `b5daa9f9` (after #7374), with a fixpoint seed on both sides. The population is the whole sweep: 23,969
programs.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). It compared each site's answer with
`monoPinSpellShaped`:

| site | reached in | rule's spelling differs in |
| --- | --- | --- |
| `monoArgFnTypeName`, recorded type | 180 | 29 |
| `monoArgFnTypeName`, instance type | 3 | 0 |
| `monoArgFnTypeName`, a hole's pinned type | 14 | 1 |
| `nodeMapArmNominalName` (non-empty answer) | 0 | — |

The function-pin differences:

- union members sorted (`()=>i32\|i32[]` against `()=>i32[]\|i32`);
- an alias or declared record kept by name (`(Shape,i32)=>Shape`, `(Circle\|null)=>i32`);
- a function result in parentheses (`()=>(()=>i32)`);
- in 2 programs, the rule declined a `never` result, which the nominalizer spells `void`.

## Changed

- The rule spells a function's `never` result as `void`, which is how it lowers (D1972). The
  rule still declines `never` in any other position.
- `monoArgFnTypeName`'s 3 sites call `monoPinSpellShaped`.
- The map rung is deleted.
- `nominalizeFnTypeOfTy`, `nominalizePartOfTy`, `fnResultEmitName` and `nodeMapArmNominalName`
  are deleted, since they have no callers.

No reader takes a function argument's pin by its spelling. The module stays byte-identical in
all 29 programs where the spelling moves.

## Measured, not changed: `monoTagMapRepName`'s record spelling

This one is the orchestrator's handoff from w324. `monoTagMapRepName` spells a record holding a
tagged set's ids as its rep (`{f: i32}`, `{xs: i32[]}`). The probe found that this spelling
reaches `structIndexOfTypeNameGo`'s shape scan in all 48 of its reaches. The scan resolves it to
the first row whose field set and layout match: an `#anonN` row.

Three typed answers were tried:

| typed answer | result |
| --- | --- |
| the rep record built as a type (`mkObjTy` with `i32` / `i32[]` fields) | has a row of its own in 0 of 48 |
| the pin named by the bound record type's row (`repRowOfTyStruct`) | **4 lost** to invalid modules |
| the pin named by the argument literal's rep row (`litRepTyAt`) | the same **4 lost** |

The 4 losses are D15640, D15651, `functions/named-function-in-record-beside-hole-record.vl` and
`functions/named-function-record-beside-hole-handed-two-functions.vl`. In each, two records
`{f: Fn#a}` and `{f: Fn#b}` share a layout but have distinct rows, and the values are built at the
row the scan picks first.

The consumer's key is the shape interner's layout identity: one row per field set and layout,
chosen by scan. No typed reader answers it yet, so the site stays a floor until the interner can
name that row by type.

## Proof

- **Byte sweep.** The master fixpoint (`b5daa9f9`, after #7374) against the candidate fixpoint: same 23,969, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **render-parse** goes from 19 / 57 to 17 / 57 (`--findings`). The baseline is not rewritten
  here: w310 writes it in its next PR.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - the comment-only fix leaves the seed byte-identical;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-spell shadow, pin-helper and render-parse budget tests: 7,464 passed.
