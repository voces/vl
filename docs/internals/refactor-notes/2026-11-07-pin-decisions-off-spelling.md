# The pin's decisions, off its spelling (2026-11-07)

Slice 2a of the call-param lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4). The naming rule says no decision may read an instance pin's spelling, so before slice 2b can
change how a pin spells, every reader of the spelling has to read the pin's type instead. Three did:
`monoPinIsFnSig` (the `=>` prefix, at seven sites), `monoHoleFnPinTyOf` (the key after `=>`, checked
against the type's `sigKeyOfTy`), and wasmEmit's `isNumRecvBaseName` (`monoArgTyName`'s text being
`i32`, `i64` or `f64`).

## What replaced each

| site | read | reads now |
|---|---|---|
| `monoSigPinHeadTy` (typed instance key) | `=>` prefix, key equals `sigKeyOfTy(t)` | `t` is a closed function type with a signature key (`monoPinTyIsFnSig`) |
| `monoInstanceFor`'s pin types | `=>` prefix, then close the hole type | deleted: no program in the population reaches it |
| `monoHoleFnPinSpell` | early `""` for a `=>` pin | dropped: the type decides, and a `=>` pin respells as itself |
| `monoSigFnTyNameAt` | `=>` prefix of each slot pin, pin count = param count | the parameter type |
| `monoPinHoleParam` (argument pin type) | `=>` prefix, then the key check | the argument's pin type is a function type, closed or filled by `elabHoleFnClosed` |
| `monoSlotPinAnn`, `monoPinFnParamTys` | `=>` prefix of each slot pin | the slot's parameter type |
| `isNumRecvBaseName` | `monoArgTyName`'s text | `monoArgClosedPinTy`: a primitive scalar, or a numeric literal union's base |

`monoPinIsFnSig` is gone, and `monoHoleFnPinTyOf` is inlined at its one remaining caller.

## Measured

Each site was first probed: a throwaway build computed both answers and failed loudly where they
differed, over the sweep population (23,610 programs). Four sites differed:

- `monoSigPinHeadTy`: 315 programs. The pin is spelled `(i32)=>i32` by an annotation over a closed
  function type. The typed key already holds that type's canonical key, so the key is the same.
- `monoInstanceFor`: 11 programs. The caller's pin is an open render (`(_) => _`), and closing it
  at `elabHoleFnClosed` broke all 11 (7 refusals, 4 invalid modules). Closing only for a `=>` pin
  is reached by no program, so the closing is deleted rather than retyped.
- `monoPinHoleParam`: 14 programs (`take(id)`, D15010). The pin key and the filled type's key differ;
  the pin type moves from open to closed, and bytes and output hold.
- `isNumRecvBaseName`: 7 programs, all a record argument, where the closed pin type is not numeric
  and both answers are `""`.

Final candidate, built to a fixpoint (two `refresh-compiler.sh` runs, byte-identical), against the
master fixpoint `8a3ba611`:

| | |
|---|---|
| sweep: same | 23,610 of 23,610 (0 bytes-only, 0 output movers) |
| seed | 6,442,998 → 6,442,351 bytes (−647) |
| pin-helper budget (`emit_mono.vl`) | 945 → 944 |
