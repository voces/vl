## Codegen, memory & runtime (Track B)

- **IR: a ref-element list boxed into a union, and a list index read into a box.** The box plan gains a `refList` arm, `emitUnionCoerceRefArray`'s first rung: a non-null, non-empty ref-element list under its own ref-list arm's tag (`refArrBoxTagOf`), the list as built, `struct.new`. Its refusal of every index read narrows to a map read (`emitUnionBoxArgGo`'s map-get rung). The self-compile's `box ladder` reaches 0.
