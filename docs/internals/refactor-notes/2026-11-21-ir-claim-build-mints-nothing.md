# IR claims: the build mints no synthetic global (2026-11-21, lane IR-N3)

The coordinator's standing rule is that a plan asked at claim time is read-only. String append
sites broke it. `strSiteArmsAt`, behind `strInPlaceMode` and `strSiteOfRhs`, mints the site's
global pair (`synthSitePairIdx`) the first time it is asked. The IR builder asks both while it
builds a claimed body, before legacy writes anything. Synthetic globals are written in minting
order (`frameGlobalSection`), so the pair moved ahead of the map backings legacy mints while it
writes. It surfaced when a map store change made `tests/cases/maps/rmw-fused-value-shapes.vl`'s
start body claimable and its global section reordered.

## The change

- `ssAskOnly`, set by `strInPlaceModeAsked` and `strSiteOfRhsAsked`, makes `strSiteArmsAt` ask
  `synthSitePairAvailable` (mints nothing). The builder uses the asked forms; legacy, and the
  lowering, which writes the site, use the minting forms.
- `irClaimFn` and `irClaimStart` take `synthMintCount` around the build. One that grew is a fall
  back, named `claim fell back: build minted a synthetic global` (`claimBuildMinted`).
  The control: with the builder on the minting forms, two functions of
  `tests/cases/inference/compound-index-assign-pins-element.vl` fall back under that row.

## The one shipped byte move

`compound-index-assign-pins-element.vl`'s start body is claimed on master, so its synthetic global
order was the builder's early mint. It now reads as legacy writes it: the same three entries, the
site pair after the empty backing, and the program prints the same. IR against legacy is unchanged.
