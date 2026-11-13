## Type system (Track A)

- **A list-of-lists' inner row is keyed by its held element type (step 7, D6).** When the outer element has no stored type, `ensureRefElemTys` keys the inner row by `rlKeyTyOf` of the element type it holds, instead of by the inner row's spelling. No behaviour change.
