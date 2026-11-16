## Codegen, memory & runtime (Track B)

- **D16730 closed:** a bound list literal whose records hold two un-annotated functions of different results four to six levels deep (`const xs = [{ a: { b: { c: { d: { f: inc0 } } } } }, … { f: half } …]`) passed the check and built an invalid module; it now runs, as depths one to three did. The literal is built at the binding's stamped rep, and the held list's ref-list slot is interned for a nested record element too.
