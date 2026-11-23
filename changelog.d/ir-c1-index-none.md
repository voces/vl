## Codegen, memory & runtime (Track B)

- **IR coverage, `index none` batch 1:** an element read through a union of lists or maps that a hole parameter holds is built by the IR. Legacy's arm-site tag chain becomes one writer, `armSiteWrite`, which both emitters call. It takes the box's local and the read's index or key as an operand. The IR admits a variable, an immediate or a key literal.

  tests/cases `index none` goes from 7 functions to 0. Of those, 5 are built; `last` moves to `member box` and one module body to `start: arm site operand`.
