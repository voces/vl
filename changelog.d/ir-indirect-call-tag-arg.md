## Codegen, memory & runtime (Track B)

- **IR coverage:** a tagged function set handed to a closed function-typed parameter is built by the IR. The set's i32 id is a plain argument to the checker's adapter call, as legacy's general arm writes it. On the 44 `indirect call` files, 47 more functions are covered and matched; the uncovered `indirect call` rows fall from 61 to 2.
- **IR coverage:** a record literal written into a place and used as the write's value reads its binding at the row legacy declares that binding's local at (D16463). A function whose recorded result is the literal's own type returns at legacy's declared result row.
