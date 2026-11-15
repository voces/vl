# Relate P2: the generic alias stops typing its shared field annotation node, 2026-11-15

Step P2 of `2026-11-15-subst-pure-design.md`; the row is D16570.

- `applyGenAliasTys` no longer writes `nodeTySet(fd.fdType, r)` behind `!inferQuiet`. That node
  belongs to the generic declaration and is shared by every instance. Its type was whichever loud
  application ran last, and it stayed untyped if only quiet applications ran. This was one of the
  `inferQuiet` reads a substitution can reach.
- `anyLitUnionUsed`'s field leg reads an untyped field annotation by its spelling
  (`annIsOneStrLit`) instead of falling through on `-1`. On the probes and the corpus the leg is not
  load-bearing: value nodes already carry the literal set. It is the contract for the unset node.
- `collectVariantFields` cannot reach a generic declaration: `structNameOfTy` names only
  `cStructPush` entries, which are non-generic declarations (`check_top_level.vl`, after the
  generic-alias branch) and their newtype brands.

## Measurements

- Fixpoint (two refreshes cmp-identical, 6,466,337 bytes).
- `probe-rollback-census.ts --fingerprint` over 20,427 programs: master's fixpoint seed and this
  one's are identical.
- Hand probes (generic alias with a bare string-literal field built by a generic function, stored
  in a list, read through a generic accessor; `A<i32>` and `A<T>` union arms): output and emitted
  wasm identical to master, with and without the spelling leg.
- Net compiler lines: +15 (21 added, 6 removed). The deleted write and its comment are −5; the
  spelling leg and its helper are +18. `emit_mono.vl` functions: 908. `inferQuiet` hidden scopes:
  13, unchanged (this read was not a scope).
