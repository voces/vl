## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): `==` and `!=` over two lists stored apart (an f64 list beside an i32 one, a list of records whose fields are stored apart) are built by the IR, through legacy's cross-storage compare; 7 of the 12 `operand type` start units are claimed.
