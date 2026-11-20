## Codegen, memory & runtime (Track B)

- **IR: a union-element list literal:** a short list literal at a union-element slot whose elements each owe a box by their own record is built by the IR, each element boxed through the shared box plan, from one decision legacy's list builder shares (`arrLitUnionBoxSlot`); 204 more corpus functions are built by the IR.
