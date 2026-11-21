## Codegen, memory & runtime (Track B)

- **Filed D17039 (clause 1):** `.map` over a `null[]` list passes its i32-stored element to a callback whose parameter is `nullref`, so a check-clean program builds an invalid module.
