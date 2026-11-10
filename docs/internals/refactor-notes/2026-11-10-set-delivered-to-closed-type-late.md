# A choice of named functions delivered to a closed function type after the elaboration, 2026-11-10

D15642 closes. D15644 is filed for a neighbour this does not reach.

**The gap.** `const g = if b { id } else { dbl }; call0({ f: g }, 3); call0({ f: g }, 2.5);
keep(g)` with `keep(f: (i32) => i32)` built invalid wasm. Only the decision after the
elaboration tags the set (the calls through `r.f` are elaboration facts), and no check runs
after it to build `keep(g)`'s adapter, so #7083 kept such a set a closure (`ftEscBuilt`). The
record was then a record of closures of one signature, which `call0`'s `f64` instance called at
`f64`.

**The change.** The delivery is built by the emitter instead, the way a lone hole lambda's
already was (`fnCloCoerceNote`):

- check_fn_tag.vl: `ftLateCloAt` admits a set of named functions delivered to a closed function
  type (a plain member only where its own type is that type). `ftEscBuilt` then lets the late
  decision tag the set, and the escape loop records the coercion at the delivery. A builtin
  method's callback other than `.map`/`.filter`'s is lowered at its own signature, so it is
  not admitted; without that, `[1, 2].map(g)` beside `call0({ f: g }, 3)` (runs on master)
  became an emit reject before `mfCallbackSigOf` learnt the coerced type.
- emit_mono.vl: `monoCloCoerceBuild` builds every member's instance at the destination's
  parameters (`monoCloCoerceMemberFe`), banked per delivery in `monoCloCoerceSetFes`.
- wasmEmit.vl: `emitFnCloDispatch` tests the id against each member and builds that member's
  closure, as `emitFnTagDispatch` does for a call.

**Graded** (master → now): the repro, invalid → runs; three members, trap → runs; delivered at
two closed types (`keep` and `keepF`), emit reject → runs; the list spelling `callL([g], 2.5)`,
trap → runs; an annotated binding, a closed return, an annotated record field and a `.map`
callback, each trap or invalid → runs; `[1, 2].map(g)` beside one `i32` call runs as on master.
`functions/set-in-record-literal-handed-to-hole-callee.vl` keeps running, and its `--names`
build loses two of its three `call_indirect`s (`call0$3`, `callL`): those deliveries now
dispatch by tag.

**Not reached.** D15644: the same choice with a `boolean` result refuses on master and still
does. A closure record and a set record handed to one hole callee (`{ f: if b { dec } else
{ inc } }` with `inc` plain, beside `call0({ f: g }, 2.5)`) is invalid wasm on master and still
is; that is D15640's family.

**Disassembly.** In the fixture's `--names` build every `call_indirect` left is a call through
a closed function type: `keep`, `keepF`, an annotated binding, an annotated field, the `.map`
loop, the closed return, and `callP`, whose set holds a plain member.
