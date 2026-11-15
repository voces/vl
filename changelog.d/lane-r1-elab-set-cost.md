## Codegen, memory & runtime (Track B)

- **D16554 closed:** a call through a callback parameter holding many distinct functions dedupes its targets through a map: 800 callbacks handed to one annotated higher-order function compile in 2.29G guest fuel, from 7.98G (CPU 0.67 s from 1.26 s), output byte-identical.
