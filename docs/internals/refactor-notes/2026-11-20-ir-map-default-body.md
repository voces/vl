# IR: a map read's computing default as SCoalBox's fused map-read arm (2026-11-20)

`mapGetOr` built `m[k] ?? d`'s default ahead of the read. So it refused any default that built a
node it could not write in place (`map read default computes`). Legacy writes the default inside
the probe's miss arm: `mapGetOrI32Head` or `mapGetOrMvHead`, then the default, then the tail. Of
the 40 misses in the armed self-compile, 27 were the narrowing rewrite's `if true { … }`
default (`const hit = m[k]; if hit is i32 …`). The rest were calls, index reads and nested `??`.

To IR-REV's design, a read whose default computes is `SCoalBox` on a new `CoalValArm` member,
`mapIndexGetOr`. That fits `SCoalBox`'s contract: legacy's shared head and present arm, a lazy
default body, a valued out.

- **Node:** `cbL` is the receiver. `cbMap`, a `MapProbe`, holds the global, its recovery, the
  key and the inline form. It is null on every other arm.
- **Lowering:** the same inline head `RMapGetOr` writes (`mapGetOrInlineHead`, now shared, over
  `mapProbeHead`, which the bare read can share), the default body into the slotless out, then
  the tail.
- **Verifier:** a probe only on its arm; a map receiver; an inline form; at the `i32` form, an
  `i32` or `bool` out; a default that ends by writing the out. Selftest cases 16 to 18 break each.
- **Unchanged:** a default that builds no node keeps `RMapGetOr` as it was.
- **Chosen:** `mapRecvReassigned` no longer looks inside the default. On both routes the default
  runs in the miss arm after the probe has read the receiver, so a default that assigns the map
  variable cannot change which map was read (the `(mm = other).length` witness). A later rule
  (`ir-mapgetor-mv-rule`) checks an mv read's out against its map's value rep.

Measured on fixpoint seeds, merge-base `f2ec7aa7c` against this branch (functions with no
blocker, blocker census): self-compile 18,409 → 18,453 of 19,255; corpus 40,615 → 40,787 of
45,678. All 40 misses build, and none is an operand after another (`map read default after an
operand`). L2 fuel 103,374,046,597 → 103,077,360,641 (−0.29%). The default stays lazy, and a
default that assigns the key or the map variable is read afterwards as legacy reads it. Both are
pinned by `tests/cases/maps/get-or-computing-default-runs-only-on-a-miss.vl`.

Writing the lowering found D17025. A narrowed read of a union field off a record that is a union
member emits invalid wasm, so the new code binds such fields to locals first.

Legacy lines deleted: 0. Moved to `@ir`: 0.
