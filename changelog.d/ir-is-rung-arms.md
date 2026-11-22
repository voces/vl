## Codegen, memory & runtime (Track B)

- **IR coverage: `x is L` over a box of list arms (the `listAcross` rung).** The test is built as `RListIsAcross`, and legacy's own tail (`listIsAcrossTail`) writes it after the box is read into the shared receiver slot, so each arm is tested by its tag, its elements or its emptiness. An element store through a box of list arms is now legacy's per-arm write in the IR too (`armIndexWriteArmsOf`, a named miss), where the IR used to ask a store plan that refuses that shape.
