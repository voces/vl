## Codegen, memory & runtime (Track B)

- **IR coverage, `==`/`!=` over a record read out of a list:** a field-wise record compare whose
  side is a list element over a variable builds through the IR. The struct compare reads each
  side's root through an explicit plan (`EqRootPlan`), and legacy and the IR share one ref list
  read writer. No emitted byte moves.
