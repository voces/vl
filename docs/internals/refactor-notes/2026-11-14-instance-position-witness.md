# A stable witness for the instance-position guard: a proposal, 2026-11-14

Lane E, at the orchestrator's ask, while closing D3373. This note is a proposal only; no code.

## The problem

`tests/vl_emit_diag_position_test.ts` (`INSTANCE_WITNESS`) and the rows D15155 and D15157 pin one
contract: a refusal raised while a hole parameter's instance is emitted names the body line in its
own module, never the template's declaration or the importing file. Pinning it needs a program the
emitter refuses inside such an instance. Every witness so far has been an open capability gap, so
each close of that gap moved the witness. On 2026-11-13 and 11-14 alone it moved three times:
- from D1680's `?.` map leaf to D16036's `?.` function leaf;
- then to D3373's `??` over a nullable function value;
- then to D2467's `as?` over a scalar-valued map read.

Two of those moves first had to position the refusal: `emitFail` became `emitFailAt` at its
expression. Most emit refusals anchor at the enclosing function's declaration, so few of them can
serve at all.

## Is there a design-owed refusal at emit?

No, by construction. The standing bar (CLAUDE.md, "The goal is `runs`") requires the checker to
refuse what the design forbids. An emit refusal is therefore either a capability gap, a clause 2
violation the next fix closes, or a check the checker missed, a clause 1 bug the checker should
take over. The nearest candidate, the float-literal overflow in `fbF64Const`/`fbF32Const`
(compiler/emit_bytes.vl), is only a backstop behind the checker's `f64LitOverflows`, which refuses
first. Neither kind is stable: the project's own goal is to drive both to zero.

## Proposal: a reserved test intrinsic

A compiler-internal intrinsic, for example `__emitRefusal__()`. The checker types it as a `void`
call and accepts it anywhere a statement is legal. The emitter refuses it with
`emitFailAt("emitProgram: test refusal", <its call node>)`. The witness becomes:

    function take(a) {
      print(1)
      __emitRefusal__()
      print(two)
    }

- **Stable.** It is no capability, so no fix closes it, and the guard measures only the anchoring.
- **Exact.** The refusal is at a known node, so the test can assert the column as well as the line.
- **Contained.** The double-underscore spelling matches the existing internal names
  (`__memory_shared__`). It can be refused by the checker outside `tests/` and the probes if the
  owner wants it unreachable from user code. A `std:` export is not needed.
- **Cost.** One checker rung and one emitter rung. It is an emit refusal by design, so
  `scripts/emit-refusal-sites.vl` and the scoreboard should exempt its literal.

An alternative is a host hook: the native `vl` injects a refusal at a named function through an
environment variable. It needs a host change and a compiler import, and the seed must load with no
host imports, so it is the worse fit.

## Until then

The witness is D2467's `as?` over a scalar-valued map read (`a.m["zz"] as? i32`), which this PR
positions at its operand. When D2467 closes, the witness moves again unless the intrinsic lands
first.
