## Type system (Track A)

- **The rest of P4: generic applications and shadowed parameters are asked of the type (step 7).** `gaeEnsure` takes only the instance type, and the shape walk calls it on a fresh walk of a registered application (`tyIsGenAppInstance`). `nameIsGenAppDecl` is deleted; its two callers ask the checker's application registry (`genAppRowOf`) instead of rendering the type and parsing the name. `gaeParamShadowed` asks `primTyIxOfName`. The render-parse ratchet falls 61 → 58 render and 52 → 46 ungraded parses; P4's render sites reach zero.
