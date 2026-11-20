# IR: a map read's computing default as its miss arm's body (2026-11-20)

`mapGetOr` built `m[k] ?? d`'s default into the enclosing body, ahead of the read, and so refused
any default that built a node it could not write in place (`map read default computes`). Legacy
writes the default inside the probe's miss arm (`mapGetOrI32Head` or `mapGetOrMvHead`, the
default, then the tail). Of the 40 misses in the armed self-compile, 27 were the narrowing
rewrite's `if true { … }` default (`const hit = m[k]; if hit is i32 …`), and the rest calls,
index reads and nested `??`.

`RMapGetOr` now carries `mgDefBody`. A default that computes is built into it, ending by writing a
fresh slotless out, which `mgDef` names. The lowering writes the body in the miss arm under its
own stack floor, as a valued `if`'s arm is written. Its nodes' settles must not drop the temps the
read's own operands consumed, so the lowering saves `lwSeq` around it. A key that is itself a
temp (`m[s.slice(a, b)]`) is the case that needs it. A default with no node keeps today's in-place
operand, so no existing claim moves.

This is the first right-hand side that holds a body. `irRhsBody` names it for the walkers that
enumerate bodies: the printer, `nodeAssigns`, rule 5 (`endsWriting`) with `nested` in the
verifier, and the bounds rule's walk.

Writing the lowering found D17025. A narrowed read of a union field off a record that is a union
member emits invalid wasm, so the lowering binds `r.mgDef` to a local.

Legacy lines deleted: 0. Moved to `@ir`: 0.
