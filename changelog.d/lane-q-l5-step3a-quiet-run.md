## Type system (Track A)

- **The checker's quiet re-check brackets are `QuietRun` values** (L5 step 3a): seven sites
  (`solveUnannotParams`, `globalInitPrePass`, `cstrProbeBefore`, `inferReturnsPrePass`,
  `bankGenAliasDeclTys`, `letFnLambdaParamTys`, `dstTyParamAdapts`'s nested ask) open and close
  through `quietRunOpen`/`quietRunEnd`/`quietRunDrop` or `quietEnter`/`quietLeave` instead of
  saving and restoring `inferQuiet`, `quietDepth` and `symEnabled` by hand. Byte-identical over 20,298 corpus programs and the L2
  build; net −7 compiler lines.
