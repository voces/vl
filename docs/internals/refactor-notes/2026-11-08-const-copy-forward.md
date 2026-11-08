# Step 4: a hole parameter's `const` copy forwards into a list join (2026-11-08)

Lane "function-value open rows", the capability matrix's `argument` row. Base: master `4d6e2fb0`,
built to a fixpoint (6,570,153 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`generic-fn-listed-slot-written-second-generic`'s `argument` row hands the forwarder's parameter
on through a copy: `function __take(a) { const v = a; print(__hold(v, id2)) }`, with `__take(id)`.
Handing `a` itself on ran since #6906. The copy refused with `a generic function taken as a value
reaches no call that fixes its type`.

A probe on the late tag decision showed the plan of `{id, id2}` failing in `ftScan`, at the list
literal `[a]` of `__hold`: `ftParamHandedWithin` asks which sets reach `__hold`'s `a`, and
`ftReachHandSets` follows a caller's argument back to the caller's parameter only when the
argument reads that parameter itself (`ftParamIndexIn`). The copy `v` was a value of no set.

Three readers now treat a `const` copy (`fnTagParamCopyOf`) as the parameter it copies:

* `ftParamIndexIn`: the reach follows the copy to the parameter.
* `ftParamForwardsSet`: the copy's reads are the parameter's, and the copy's seed is no read.
  Without it, a copy nothing reads makes the forward test fail.
* `elabAliasSetFwd`: a copy of a copy forwards where the second copy is read. Without it,
  `const g = f; const h = g; take(h, id2)` marks `{id, id2}` partial.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,745 programs | | 23,743 same, 1 bytes-only, 1 output mover, 0 `runs → not-runs`, 0 new traps |
| the output mover | emit reject | runs: the new fixture, one copy and a copy of a copy |
| the bytes-only mover | 808 bytes | 763: `generic-fn-value-two-type-param-params-into-annotated-binding.vl`'s `mid2` (`const c: F = b` of `const b: F = a1`) now lowers as its one-copy `mid` does, 616 → 522 bytes alone, same output |
| matrix `generic-fn-listed-slot-written-second-generic` | 14 of 46 run | 15 of 46 run (`argument` un-annotated), 0 moved, 0 silent |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail | | −1.8% / −2.8% |
| peak RSS of the `vl build`, main / tail (VmHWM) | 321,798 / 321,846 kB | 321,828 / 321,838 kB |
| seed (fixpoint) | 6,570,153 | 6,570,718 (+565; +2.7% of the seed-size baseline) |

## What stands

The matrix's other un-annotated refusals are not this mechanism and were not ablated here.
`struct_field_init`, `array_element`, `map_value` and `map_set` refuse in mono with `unsupported
argument type for \`a\``. `struct_field_assign`, `array_element_assign`, `array_push` and
`return_annotated` refuse at check with `argument 1: expected i32, got string`. The annotated
face refuses by design: no function type spells a value called at two types.
