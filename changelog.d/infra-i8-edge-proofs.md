## Infrastructure (Track F)

- **I8's edges into stage B, proven:** 14 more of the 24 static calls from kept functions into stage B are proven never taken by the IR (`scripts/ir-i8-census/edges-proven.txt`, 15 of 24); four more sit behind one uncovered miss (`non-stack temp: out of order` in a `for` over a list literal), and the rest are classified in a refactor note.
