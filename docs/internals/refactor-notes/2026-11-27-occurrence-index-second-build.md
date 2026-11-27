# The occurrence index is built twice per self-compile (parked)

Measured 2026-11-27 on an L2 fuel profile of master `4670a29e`. `cwIxBuild`
(check_write_scan.vl) costs 1.05% of L2 fuel, and it runs twice per self-compile: once at
about 1,676K nodes and again at 1,687K. The second build is a full reset from `rcwArenaReady`
once the arena has grown, so about 0.5% L2 rebuilds an index after 0.6% new nodes.

What grows the arena is the checker lowering each checked `match` in place
(`check_match.vl` `matchLower` → `desugarMatchAt`), as it reaches it. Between the two builds
the arena gains 10,875 nodes (5,096 IfStmt, 3,199 BinExpr, 1,965 Block, 612 NumLit, 3 other)
and 6,807 in-place edits.

An incremental extend was declined (coordinator ruling, 2026-11-27). The appended kinds file
no occurrence, but the lowering also leaves old nodes unreachable (a scrutinee whose every arm
test reads a copy, D14539). A fresh build skips those nodes, while the append-only occurrence
rows would keep them. Making that exact needs tombstones in every occurrence-chain reader, which
costs too much risk for 0.5%.

The fix is structural: once the match lowering leaves the checker (I9, or the IR-pass phase),
the arena no longer grows mid-check and the second build disappears for free.
