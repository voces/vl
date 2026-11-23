## Codegen, memory & runtime (Track B)

- IR coverage, start functions' global initializers (lane IR-M1): three cases are now stored as legacy stores them. The first is a record on the heap legacy declares the global's cell at (`globalCellHeap`). The second is a list the body lanes' retags take. The third is a closure or list that differs only in a hole (`bodyRetagAt`). These retags fire only where the cell would not take the value as it stands (`cellTakesAsIs`). On tests/cases, `start: global initializer coercion` falls 29 → 20 and programs fully IR-only rise 5,056 → 5,059.
