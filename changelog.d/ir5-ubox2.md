## Codegen, memory & runtime (Track B)

- **IR: a record or a scalar list boxed into a union.** The shared box plan gains a `rec` arm (a record boxed as itself under its arm's tag, `emitUnionArmValueBox`'s two plain rungs as one decision, `armValuePlainOf`) and takes a scalar list under its list kind's tag, as the value-atom box writes it; both emitters box through it.
