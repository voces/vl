## Codegen, memory & runtime (Track B)

- **IR covers `r?.f ?? d` over a union box field whose receiver legacy stages (lane COV-UNION):** an element, a call's result or a field over one is teed into the `?.` stash and read back from it through the chain walk the box leaf shares with the standalone `?.` read. Files D17541 (the fused map read's `?.` over a value-union box field refuses).
