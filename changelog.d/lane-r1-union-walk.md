## Codegen, memory & runtime (Track B)

- **D16555 closed:** an `is` ladder over a union of N records keys each narrowed union in near-linear time, not square: the member dedupe buckets by declaration, the text dedupe is a map and the sort a stable merge. 400 arms compile in 2.30G guest fuel, from 12.29G (CPU 0.42 s from 1.52 s), output byte-identical; L2 self-compile fuel −0.7%. Four further super-linear compile shapes from the same scaling grids are filed as D16556–D16559.
