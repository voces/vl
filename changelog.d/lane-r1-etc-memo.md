## Codegen, memory & runtime (Track B)

- **D16554 residual:** `elabTyClosed` keeps its memo across walks while `tyMutEpoch` holds, instead of clearing it per walk: 800 callbacks handed to one annotated higher-order function compile in 1.85G guest fuel, from 2.29G, output byte-identical (corpus 0 of 6,871 modules differ).
