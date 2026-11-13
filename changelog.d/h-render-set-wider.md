## Infrastructure (Track F)

- **Step 7: the render-parse census counts every spelling renderer, not just `tyToEmitName`.** `tyToNominalName`, `canonEmitNameOfTy`, the union key and spelling renderers, `rlRowNameOfTy` and the pin spellers are `ty-render` (13 → 101); the message renderers (`tyToStr` and kin) are counted apart as `ty-render-display`. `render-parse-origins.ts --check` ignores rows of sites that no longer exist.
