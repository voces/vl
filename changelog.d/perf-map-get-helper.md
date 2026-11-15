## Codegen, memory & runtime (Track B)

- **A mono-valued map get, `m[k]` or `m[k] ?? <literal>`, is one call of a per-shape `__map_get_<row>__`** in a plain build: it probes and reads the value in one helper, in place of the probe call plus an inline entry test and value read. `-O` and every other map read are unchanged. The self-hosted compiler's seed is 0.93% smaller.
