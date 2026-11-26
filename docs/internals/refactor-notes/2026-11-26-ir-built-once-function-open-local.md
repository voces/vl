# A function with one instance holds an open local as built (lane CENSUS, 2026-11-26)

**Mechanism.** Rule 1 refuses a variable whose type still holds a type variable unless its open
parts are held at a rep no instance changes (`tyOpenHeldAsIds`). A function value is held only where
`closureHeld`, which a build that makes records of closures (bundles, holders) never is, so a local
list of hole functions (`((_) => _)[]`) refused (`open local type`) in any such build. But a
function with no type parameter, every parameter's type closed and no environment has one instance
(`fnBuiltOnce`): nothing re-builds it at another rep, exactly as for a start body (#10289). The
builder marks it (`irBuiltOnce`) and `irFnBuiltOnce` then answers true for it as for a start body,
in the builder's checks (`ibTyOpen`, `irBDeclVar`) and the verifier's facts (`irVarHeldIds`).

**Reading** (census probe on master's fixpoint seed; class programs only, regen-10 — 4 programs,
all `run` in `closures/bundle-record-*`):

| | before | after |
|---|--:|--:|
| programs with the unit | 4 | 0 |
| of those, claimed under `VL_IR_REQUIRE_CLAIM=1` | 0 | 3 |

The fourth (`bundle-records-apart-only-in-their-closures-types.vl`) moves to `convert list -> list`.
Each prints its `@log` lines.
