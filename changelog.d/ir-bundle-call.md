## Codegen, memory & runtime (Track B)

- **IR: a call through a bundle parameter:** a hole parameter called at two signatures holds a record of closures (D14841); a call through it builds in the IR, reading the member closure for its signature and calling it as a plain closure call. Byte-identical; in `tests/cases` the `call of a non-declaration` blocker class falls from 849 functions to 514.
