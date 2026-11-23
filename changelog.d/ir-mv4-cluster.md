## Codegen, memory & runtime (Track B)

- **A `??` over a global copy of a map read of un-annotated functions now runs (D17057, D17058).** `const mv4 = m4["k"]; const got = mv4 ?? [inc0]; print(got[0](3))` at module scope was refused with "a function-value call has no interned signature". The binding kept the open element type `(_) => _`, because mono's held-type rule followed only a bare read of a binding it had closed. A `??` over such a read now holds that binding's closed type, without its null unless the `??` may still be null. The elaboration's agreement check still guards the binding.
