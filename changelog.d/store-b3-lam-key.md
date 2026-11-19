## Type system (Track A)

- **B3: a lambda set called through a hand-back call is decided at check:** a callee that is itself a call of a function handing back its argument (`fw(lam)(3)`) goes through the handed set, as a `const` bound to one does; such a call's owner-less solve no longer pairs it with hole calls in unrelated declarations (`arrowRowStray`); and a row's per-call facts are built for a lambda set where its body types at the call's arguments. 1 late tag row moves (326 → 325).
