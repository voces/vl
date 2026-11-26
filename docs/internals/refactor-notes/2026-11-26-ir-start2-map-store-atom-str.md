# START-2: `map store value atomStr` (2026-11-26)

Regeneration 9's unowned class, granted to START-2 by CENSUS: 2 programs, 4 units. Graded on master
ce2e75bb, all four units are claimed. `literal-unions/atom-field-read-as-string-positions-runs.vl` is
fully claimed. `literal-unions/litunion-atom-assign-targets.vl` keeps `variantCtor` on `object variant
field strAtom`, another class.

`mapSetValArmOf`'s `atomStr` arm is a literal-union atom stored into a `string` (or `string | null`)
map value. `mapSet` now admits the arm, and `mapSetValue` delivers the value at the map's value rep,
where `widenTo` decodes the atom (`atomToStr`). That is how a push into a `string[]` already takes it.

`ir-parity --run-all --behaviour-only`: byte-identical on both programs and on the sweep, which
misses the class five times on master (field, `.set` parameter, local, global, nullable-valued map).
