## Codegen, memory & runtime (Track B)

- **Self-compile −1.92G L2 fuel (−1.97%)** (`refactor-notes/2026-11-16-same-variant-and-rep-of-ty-memos.md`):
  `sameVariantTy` answers a closed pair once per arena generation, and `repOfTy` once per type per
  rep-tree build. Byte-identical over 8,430 corpus modules; the self-compile baseline is
  rewritten at 95.67G.
