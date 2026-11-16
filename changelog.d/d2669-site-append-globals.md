## Codegen, memory & runtime (Track B)

- **D2669 closed:** a string append outside any loop, in a helper a loop calls (`function add() { acc = acc + "ab" }`), extends in place across calls. Such a site's buffer and frontier live in a pair of module globals instead of locals that died with each call. 200,000 calls go from 5.9 s to 14 ms, and D2669's witness from about 0.95 s to 13 ms. A 40-seed randomized mix of helper appends, prepends, snapshots, restores and recursion prints exactly what the copying lowering prints.
