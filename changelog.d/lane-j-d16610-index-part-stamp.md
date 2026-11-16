## Type system (Track A)

- **D16610 closed:** an element read of a fresh list `const` beside a wider record part (`const s = [{ x: 1 }]; [s[0], { x: 2.5 }]`) now runs. The list is built at the wider record, as a spread of it is, where before it passed the check and was refused at emit in every position. Handing `s` on at its own type is refused at check with the shared-record contract. Adds two position matrices (bare and nullable element).
