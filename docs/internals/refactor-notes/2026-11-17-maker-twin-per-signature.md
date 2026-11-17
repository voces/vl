# Maker twins build their returned hole lambda per signature (lane SLOT, 2026-11-17)

Lane INIT's part (b) for [D16851](../inventory/D16851.md) and [D16871](../inventory/D16871.md),
taken over from INIT's handoff (#8888). It also closes [D16922](../inventory/D16922.md), a clause-1
row the new matrix found, and [D16294](../inventory/D16294.md).

## What changed

- **Check, `fvaMakerCallRows`** (`check_assignable.vl`). A maker call bound by an un-annotated
  `const` whose reads are handed on at one closed function type is noted at that type
  (`fvaHandedOnSig`). Before, any read other than as a callee reset the call to no signature.
  A binding no call reads now registers too.
- **Elab, `elabTwinLamSig`** (`emit_elab.vl`). An accessor over the existing `ekRetWide` fact:
  the closed signature of the maker twin being walked, for a hole lambda it returns whole. It
  declines in three cases:
  - a maker its calls pin;
  - a sibling twin at the same parameters with another result (D16770's per-result twins);
  - a lone twin of a non-capturing lambda, which the old path already builds.
  It adds no new store.
- **Mono, `monoPinValueLambda`** (`emit_mono.vl`). Such a lambda is built as an instance of
  itself at the twin's signature (`monoInstanceFor`, type-keyed pins). Its body, parameters,
  result and closure environment are then the twin's own. Before, both twins shared one lambda
  node, and a capturing one was cloned with an environment typed at the default `i32`.

## Readings

Fixpoint seeds on both sides: master `e45d81194` and this branch.

| check | reading |
|---|---|
| `tests/cases`, error text compared | 5 differ: the 4 D16851/D16871 fixtures now run, and `written-let-of-generic-returned-to-an-inferred-caller.vl` builds other wasm with its `@log` output unchanged |
| distilled corpus, per cell | see the PR |
| matrices, master → branch | 42 maker / relay / returned-lambda templates: 0 runs → not-runs, 0 → silent, 0 traps |
| `plain-maker-hole-lambda-at-two-signatures` (new) | 48 of 48 run; `two_instances` emit refuses → RUNS |
| `capturing-maker-hole-lambda-at-two-signatures` (new) | 48 of 48 run; 19 SILENT → RUNS (D16922) |

## Narrowings the grading forced

1. **Every plain maker twin.** `lambda-maker-relay-at-two-results` trapped: its twins share
   parameters and differ in result, which an instance keyed by parameters cannot tell apart. The
   rung declines for every twin of a maker that has such a pair, since serving a third twin
   beside them pinned the template slot they use and trapped too. Residue, still a loud refusal
   as on master: [D16923](../inventory/D16923.md).
2. **A lone non-capturing twin.** `hole-fn-lambda-relaying-i32-at-f64-fn-type`
   (`return_inferred`, un-annotated face) went runs → emit refuses: its lambda calls a hole
   function, which the instance path does not re-instance. The old path already built that
   case. Residue at twins apart, loud as on master with another sentence:
   [D16926](../inventory/D16926.md).

## Not done

[D16845](../inventory/D16845.md) is one binding called at two parameter types. It needs one call
building a bundle of closures over one environment, as ruled. That is the next PR.
