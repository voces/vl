## Self-hosting & modules (Track H)

- **Mono's instance builder takes an explicit request** (L5 step 1a): the nine globals a caller
  set and `monoMakeInstanceGo` consumed (call frame, call, delivery, keyed decision, widened and
  reproduced results, argument literals) are one `InstReq` record; byte-identical over 20,058
  corpus programs and the L2 compiler build.
