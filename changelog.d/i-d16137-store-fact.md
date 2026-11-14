## Type system (Track A)

- **D16137 closed:** a joined record of un-annotated functions handed to an un-annotated parameter, bound to a `let` the callee re-points to its own record literal, runs: `let v = a; print(v.f(3)); v = { f: half }; print(v.f(4))` prints `4` `2`, where it was an emit reject. The elaboration notes the literal as stored at the parameter's set, and the late tag decision builds it there. Two callers with different sets (D16213) and a written function outside the set (D16214) are still refused at emit.
