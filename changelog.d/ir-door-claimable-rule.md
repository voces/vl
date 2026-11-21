## Infrastructure (Track F)

- **A shipping IR door gates on `claimable()`:** ir-design §10.2 and the merge queue's veto list now require any legacy-to-IR door that writes shipped bytes to claim only when every node is in a claimed family, so `ir-identity.sh --claimless` sees it.
