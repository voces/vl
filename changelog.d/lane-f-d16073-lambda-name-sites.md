## Codegen, memory & runtime (Track B)

- **The emitter's "is this a lambda" tests read the renamed spelling (D16073).** Fifteen tests
  of `fnName == ""` that run after `collectFns` names every lambda `__lambda_N` now ask
  `fnNameIsLambda`, or drop a conjunct a later test already covers. Every program compiles
  byte-identical; the one site whose test changed an outcome was D16075.
