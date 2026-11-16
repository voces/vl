## Type system (Track A)

- **D16829 closed:** a map whose `set` writes records nesting a record of un-annotated functions with different results (`m.set("a", { r: { f0: inc0 } })`, `m.set("b", { r: { f0: half } })`, then `t.r.f0(3)`) runs, at any depth. Check used to refuse it ("every function a call through 'm[].r.f0' may run must return one type"). The index-store and `?.` spellings are still refused at check.
