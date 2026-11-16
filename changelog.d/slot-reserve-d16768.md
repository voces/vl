## Codegen, memory & runtime (Track B)

- **D16768 filed (design row):** mono's pin readers ask what a slot is delivered at while the flow rewrite is changing the program, which the place classes cannot answer. The target is an elaboration-time pin table that mono only reads; until then the delivery walk is mono-only, and `elabSlotDeliveries` says so.
