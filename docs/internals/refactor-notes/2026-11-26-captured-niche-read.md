# IR: a captured union box read as its niche (lane COV-CLOS, 2026-11-26)

A union binding `w: F | null | string` narrowed past `string` reads as its niche-repped `F | null`
(legacy's `niche` arm, `emitNarrowedNicheRead`: the box at its storage, then the niche tail). A
local read already builds that (`RNicheRead` over the variable); a capture of `w` read inside a
closure missed (`read of w`), since `captureRead` took only the `capture` and `unbox` arms. It now
reads the box as the capture holds it (`capturedAsHeld`) and applies the same niche read
(`captureNicheRead`).

## Measurements

MEASUREMENTS_PLACEHOLDER
