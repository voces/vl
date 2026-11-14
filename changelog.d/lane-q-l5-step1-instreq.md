## Self-hosting & modules (Track H)

- **Mono's instance builder takes an explicit request and one build frame** (L5 step 1): nine
  globals a caller set for the builder to consume are one `InstReq` argument, five it saved and
  restored are one `MonoBuild` frame, and two write-only globals are gone; byte-identical over
  20,064 corpus programs and the L2 compiler build, net −16 lines, hidden-argument globals
  188 → 175.
