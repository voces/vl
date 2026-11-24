## Codegen, memory & runtime (Track B)

- **IR coverage, `member box` / `method has` (arm-site writer batch 2):** the IR now builds a `.length`, a map's `.has` or `.get`, and an element's `.length` through a union of lists or maps, on the arm-site writer `armSiteWrite` that legacy also calls. An element's `.length` first stashes its box in legacy's receiver stash, as legacy does.

  tests/cases `member box` goes from 7 functions to 0 and `method has` from 2 to 0. Of the 9, 7 are built; `last` and a narrowed lambda read move to `arm site operand`.
