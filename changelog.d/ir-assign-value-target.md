## Codegen, memory & runtime (Track B)

- **IR: a field or element write used as a value is built by the IR (`assignment value target`).** On legacy's `reRead` arm (`emitAsgValue`), the store is followed by the target read again whole, receiver and index included, under the re-read context. The IR now does the same for a `Member` or `Index` target, as it did for a name. A write whose value is itself a field or element write, which legacy parks through a scratch frame, stays the named miss `store of a field or element write`. Legacy bytes are unchanged.
