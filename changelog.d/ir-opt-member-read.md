## Codegen, memory & runtime (Track B)

- **IR coverage:** a standalone `?.` over one link and a variable base is built by the IR (`ROptRead`), along legacy's leaf plan and link null test, which `emitOptMemberValueGo` now writes through the same helpers. `expression optional member` 40 → 5 on tests/cases.
- **IR coverage:** a `.length` that reaches legacy's `emitMem` past every earlier length arm (a record's field through a narrowed binding, say) is a plain member read. `member record` 38 → 10.
