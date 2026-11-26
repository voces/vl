# A maker's first instance hangs its minted lambda off its own slot (lane COV-CLOS, 2026-11-26)

A function delivered at a function type is instanced; the lambda inside it is minted once per
instance, and its frame (`fnParent`) is what `parentBindingOf` walks to find each capture's binding.
A later instance re-pointed its minted lambdas at itself (D943, `monoMakeInstanceLater`); the first
instance, which takes the template's own slot (`monoMakeInstanceFirst`), did not, so its lambda had
no frame. Every capture of a local there resolved to no binding: legacy held the env field at
`captureValKind`'s `i32` default (an invalid module for an f64 or string capture, D17668), and the
IR missed `closure env capture` or `capture binding`. The first instance now re-points them
too, through the helper that re-points a nested lambda's clones (`monoReparentNestedLams`), so the
pin and position layer gains no helper.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base at master
`a7f7f6f1a`, head on it): `closure env capture` 6 → 0 and `capture binding` 4 → 0. Claimed functions
98,112 → 98,122, unclaimed 313 → 303, claimed starts 8,481 → 8,481, claims fallen back 11 → 11; 0
claimed functions or starts lost, no other class moved.

`scripts/silent-sweep/distilled/regress.vl` on the head seed: no runs lost.

D17668's witness: invalid module on the base seed, runs on head printing its `Want`.

Q58 position sweep (`tests/cases/closures/maker-capture-kinds-at-two-function-types.vl`: an f64,
a string, a bool, a record, a captured parameter and a capture two lambdas deep, each read through
both instances): base builds an invalid module and misses 5 `closure env capture` and 4 `capture
binding` bodies; head runs every body claimed under `VL_IR_REQUIRE_CLAIM=1`, with no late demand.
`maker-delivered-at-two-function-types.vl` (`counted`, an `i32` capture, ran before): now claimed.
