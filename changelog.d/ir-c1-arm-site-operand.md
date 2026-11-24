## Codegen, memory & runtime (Track B)

- **IR coverage, `arm site operand` part 2 (Q57):** an arm-site element read whose index calls and writes nothing but is not a variable or an immediate (`a[a.length - 1]`) is now built by the IR. The index is built once ahead of the tag chain into its own `i32` stash (`armIdxSlot`), and each arm reads that stash. Legacy writes the index again in the one arm that runs. The value and its evaluation count are the same; the bytes differ, as listed in `scripts/ir-divergence-baseline.txt`.

  tests/cases `arm site operand` goes from 1 function to 0. An index that calls stays a named miss.
