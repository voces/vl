## Codegen, memory & runtime (Track B)

- **IR coverage: a record call at its callee's result row.** A call whose own type keys the struct row its callee's functype returns (`retStructRowIndex` = `fRetStructIdx`, `callAtCalleeResultRow`) is the callee's result at its signature rep, not a `call result coercion` miss: tests/cases function bodies +28, start bodies +13, programs fully IR-only 4,052 → 4,067.
