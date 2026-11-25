## Codegen, memory & runtime (Track B)

- IR coverage, assignment values 2 (lane COV-UNION): a write into a union list's element or a union map's entry used as a value is its parked box unboxed to the value's arm, and a wider record written into a name is its re-read cast to the wider row (`RRecDown`, D16105); claimed byte-identical. `assignment value boxedArm` 4 → 0 and `assignment value widerRow` 3 → 0 on their programs.
- **Wider record write as an `if` arm (legacy refusal):** a record wider than a name's own, written into the name as a valued `if`'s arm, is the arm's value; the IR builds it (`RRecDown`) where legacy's arm planner reads it as a statement and refuses (listed legacy-wrong in `scripts/ir-divergence-baseline.txt`).
