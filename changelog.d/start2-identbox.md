## Codegen, memory & runtime (Track B)

- **IR claims an identity compare over a narrowed union operand:** a union binding narrowed by an assignment or an `is` test is read at its storage, the box legacy pushes, and `===` compares the payload. `identity compare narrowed box operand` falls 2 → 0: `operators/identity-eq-narrowed-union-operand.vl` (`f`) and `operators/identity-sweep-narrowed-union.vl` (`go`) are fully claimed. Claimed and claims-off builds are byte-identical.
