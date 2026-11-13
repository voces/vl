## Type system (Track A)

- **D16001 closed: a one-member union keys as its member (step 7).** `type M = Node & {…}` with both an `M[]` and a `Node[]` list minted two ref-list rows for one type: keyed through the wrapper, the member met the wrapper on the hash-cons stack as itself and keyed as a back-edge. `repIdOf` now peels a one-member, non-literal union before pushing it.
