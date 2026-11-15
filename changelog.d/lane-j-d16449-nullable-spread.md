## Type system (Track A)

- **D16449 made loud:** a spread of a fresh list `const` of nullable records beside a wider record part (`const s = [{ x: 1 }, null]; [...s, { x: 2.5 }]`) is refused at check with the shared-record contract. Before, it passed the check and built an invalid module at every position of the new `spread-nullable-record-list-wider` grid. Filed D16610: an inline index read beside a wider part is refused at emit. Adds eleven discovery grids; the call-list face (`[...mk(), { x: 2.5 }]`) goes from invalid module to the same refusal.
