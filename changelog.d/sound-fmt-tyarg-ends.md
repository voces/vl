## CLI (Track C)

- **`vl fmt` keeps each call's explicit type arguments when one instanced call is nested in another**: `print(a<i32>(b<i32>(x)))` was refused as "formatter produced invalid output" (rc 3), since the outer call read its type arguments' end offsets after parsing its arguments, where the inner call had overwritten them, and printed the inner call twice.
