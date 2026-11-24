# IR soundness: a staging `??`'s box head is written after its staged leads (2026-11-24, lane IR-N11, D17091)

Express fix for a clause-1 defect in the IR's claim. A `??` along an arm that stages an earlier
operand below its `if` (`coalArmStagesLeads`: `litUnion`, `nulBool`, `nulRef`, `nulStr`,
`nulBoolJoin`), whose out is boxed into a union, shipped invalid wasm. `f + show(rc ?? false)` is
one such program; `pair(f, rc ?? false)` into an `i32 | boolean` parameter is another.

`stashIfBoxHead` wrote the box's head (its tag) before the `??` node opened. `coalBox` then
staged the leads above it, giving `[tag, lead, if]` where legacy writes `[lead, tag, if]`. A valued
`if` was already right: `valuedIfOpen` stages, then writes the head (`joinBoxHead(t, true)`).

- **`stashIfBoxHead` (ir_lower.vl)** no longer writes a staging `??`'s head ahead of it.
- **`coalBox` (ir_lower.vl)** writes it after `stageLead`, as `valuedIfOpen` does.

The builder and legacy are untouched.

## Measured

Base 86dd79148, both seeds fixpoints.

- Sibling sweep: 4 staging arms × {concat, interpolation, nested call argument, direct argument}.
  All 16 build invalid wasm on base. On head all 16 run, with output identical to a claimless
  compiler. `nulBoolJoin` (whose box writes no head) and the unboxed `f + plain(rc ?? d)` ran on
  base and still run (8 more cells).
- Escape: modes 1 and 6 report `fail a claimable function did not match` on the witness. No corpus
  cell or tests/cases program had the shape, so the armed shadow never saw it.

Pins: `tests/cases/null/coalesce-boxed-argument-after-a-lead-{concat,interpolation,argument}.vl`.
Row: `tests/ir-shadow-rows/coalesce-staged-arm-boxed-after-a-lead.vl` (9 functions fail on base;
all match on head).

## Legacy tails the IR calls

None new: `joinBoxHead` and `holeBoxHead`, which `valuedIfOpen` already calls.
