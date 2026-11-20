## Codegen, memory & runtime (Track B)

- **IR coverage:** an `is` test over a local `U | null` union box (`const n = if ok { x } else { null }; n is A`) reads the box raw and tests its tag, as legacy does (self-compile: 52 more functions covered, corpus 4).
