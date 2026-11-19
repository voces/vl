# IR: function values, step 1 (2026-11-19)

STORE's IR coverage track takes the function-value blocker classes. The blocker census on master
(`ir-shadow.vl -- --blockers`, distilled corpus) ranked them:

| class set | functions it alone kept uncovered |
|---|---|
| `call of a non-declaration` + `local rep closure` | 233 |
| `callee environment` + `statement` | 203 |
| `call of a non-declaration` + `parameter rep closure` | 61 |
| `call of a non-declaration`, `indirect call`, `local rep closure` alone | 16, 13, 11 |

## What the builder now takes
- **A closure-rep variable.** `valueRep` admits `RClosure`, so a local or parameter holding a
  non-null closure is an IR variable.
- **A function value.** A function name, or a function literal, read as a capture-free closure
  is `RMakeClo` (`cloValue`, shared with the global initializer `cloInit`).
- **A call through a closure binding** is `RCallRef { crFn, crSig, crArgs, crVoid, crDrop }`
  where legacy writes the plain call. That decision is one function in `wasmEmit.vl`,
  `callRefPlainKey`. It returns the `$fnsig` key when the callee is a binding no builtin or
  function owns, there is no tagged dispatch, lift, bundle or holder, every argument is a scalar
  at its parameter's own valtype, and no refusal fires on the way; otherwise it returns "". A
  function of the same name in scope makes it decline: legacy then asks its live scope
  (`identNameIsLiveBound`) which one the name means, and the plan reads no ambient state.
  - **Legacy agrees, armed (option (b) of the review).** Under the IR shadow, legacy records the
    key it wrote each closure call at with no bundle, coercion or narrowing arm on the way
    (`callRefLegacyPlainKey`): `emitCallRefArg` returns 1 only from its general arm with nothing
    owed. The IR build, which runs after legacy, fails the build when its key is not the one
    legacy recorded. Control: a scratch predicate that ignored the coercion test failed
    `(a: f64) => f64` called with `3` with "the IR's plain closure call disagrees with legacy's",
    and built unchanged unarmed. Option (a), legacy consuming the predicate, needs the route's
    25 conditions to become one ladder; that is a later step.
  - **One writer for the bytes.** Legacy and the IR write the call through the same head and tail:
    `callRefStash` (the closure into the depth-keyed stash), `callRefEnvOpen` (its env, one depth
    down for the arguments) and `callRefCallTail` (the function index, then `call_indirect` or its
    tail form).
  - A statement drops the result as `emitCallStmtIdent` does (`callRefPlainVoid`). `RCallRef` joins
    the claimed `closure` family.
- **A direct call into a nested or lifted function.**
  - A callee with the hidden environment parameter gets `ref.null struct` before its arguments
    (`caEnv`).
  - A lifted callee also gets its captures (`caCaps`), when each is a parameter of the function
    being built. That lookup is pure (`paramIndexOf`). `captureHomeOf` reads legacy's live scope,
    which a claim would see empty, so it is not used.
  - A binding holding a lifted lambda is a direct call of it (`cloLiftCalleeOf`).
  - A lifted callee that assigns a capture hands it back after its result (`cloLiftWriteCount`),
    so it stays legacy's.
- **Statements that write nothing:** a `const` bound to a lifted lambda, a nested function
  declaration (unless it drops a cached env), and a bare function name (`stmtIsBareFnName`, D6980).

Found while gating: `irGlobalRepOf` scanned the function's noted globals linearly. The start body
now builds past 3,000 closure-global reads, so the `closures` scaling axis read 2.97 against its
2.5 bar. It is now a map lookup.

## Measured on fixpoint seeds: master `a37ca941e` against this branch

| | master | this branch |
|---|---|---|
| distilled functions claimed (`--claims`, 0 fell back), all matched armed | 30,836 | 31,304 |
| self-compile functions claimed, of 18,895 | 12,727 | 12,764 |
| `call of a non-declaration` + `local rep closure` | 233 | 0 |
| `callee environment` + `statement` | 203 | 0 |
| `call of a non-declaration` + `parameter rep closure` | 61 | 0 |

- **`ir-identity.sh`:** plain and `--names`, 9,034 identical, 0 differ, self-compile identical.
  `--cases`: 7,512 identical, 0 differ.
- **Mode 3** (claim everything): 19,079 cells and run cases byte-identical, and the self-compile
  identical.
- **Cost:**
  - L2 self-compile fuel, same box against master's seed: 99,541,376,265 → 99,766,184,054
    (+0.23%);
  - scaling axes green.
- **Lines:** +408 / −65 in `compiler/`, the field table's reflow in `lint.vl` among them. A coverage step, so the bar
  is functions per line: 468 distilled and 37 self-compile functions.

## What is left in these classes
- `call of a non-declaration` alone: 46. A callee `callRefPlainKey` declines: a wide or coerced
  argument, a bundle, a holder or a nullable closure.
- `callee captures`: 36. A capture that is a local, or a lifted frame's own capture.
- `indirect call`: 17. A call through a non-name value.
- `closure env`: 14. A function value that captures.
Those are the next steps, together with the closure result reps.
