## Type system (Track A)

- **B3: the arrow facts drop a stray row:** a call through a name bound to a set validates every body's deferred rows under its owner-less pin, so the arrow rule paired it with hole calls in unrelated declarations (`ap(f, x) { return f(x) }` beside `g(3)`), at open argument types, which marked the set open and left it to the late decision. `arrowFactsBuild` now skips a row whose hole call is in a named declaration no member of the call's set holds; 3 late tag rows move (329 → 326).
