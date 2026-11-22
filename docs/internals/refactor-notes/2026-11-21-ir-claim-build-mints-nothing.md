# IR claims: the build mints no synthetic global (2026-11-21, lane IR-N3)

The coordinator's standing rule is that a plan asked at claim time is read-only. String append
sites broke it. `strSiteArmsAt`, behind `strInPlaceMode` and `strSiteOfRhs`, mints a global site's
pair (`synthSitePairIdx`) the first time it is asked. The IR builder asks both while it builds a
claimed body, before legacy writes anything. Synthetic globals are written in minting order
(`frameGlobalSection`). The early mint only matched legacy by accident, at bodies whose first mint
is the pair. A map store change made `tests/cases/maps/rmw-fused-value-shapes.vl`'s start body
claimable and its global section reordered.

## The change

- `strInPlaceModeAsked` and `strSiteOfRhsAsked` pass `ask` to `strSiteArmsAt`, which then asks
  `synthSitePairAvailable`, which mints nothing. The builder uses the asked forms.
  `synthSitePairIdx` asks the same predicate, so the condition is one.
- Legacy asks the arm at every assignment, in `emitAssignUnder` (`strSiteArm`). The builder notes
  the first node of an assignment whose right side is a `+` chain (`irSiteArmAt`). The lowering asks
  legacy's arm there (`strSiteArmMint`), so the pair is minted at the point legacy mints it, through
  legacy's own test.
- `irClaimFn` and `irClaimStart` take `synthMintCount` around the build. One that grew is a fall
  back, named `claim fell back: build minted a synthetic global` (`claimBuildMinted`).
  The control: with the builder on the minting forms, two functions of
  `tests/cases/inference/compound-index-assign-pins-element.vl` fall back under that row.

## Measured (fixpoint seeds of master 39bc68af and the change)

No shipped byte moves. tests/cases A/B is identical 7,318 and `--cases` identical 7,598 (both differ 0),
`--claimless` differ 0, and `--names` and mode-3 self are byte-identical. Coverage is unchanged.
L2 fuel +0.06% per PR.
