## Codegen, memory & runtime (Track B)

- **IR coverage, a tagged call's union result and a closure cell initialized from a closure global:** a call through a tagged function set whose result is a union builds through the IR (stacked on #9599's legacy slot order), and `let d = c` with `c` a module global holding a closure is that global's value. tests/cases bodies +14 and starts +27 covered = matched.
