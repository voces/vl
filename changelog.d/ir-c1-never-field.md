## Codegen, memory & runtime (Track B)

- **IR coverage: a field read typed `never`.** In an instance whose type parameter binds `never`, such a read is built at the i32 its slot stores, as legacy reads it (D15530), and only over a field the record's row stores as i32. tests/cases `rep novalue` goes from 1 function to 0.
