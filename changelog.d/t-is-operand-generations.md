## Type system (Track A)

- **D2408, D2449, D2464, D3251 closed:** re-testing a place after a call that may write it now runs, for a bare name, a field or element path, and inside a nested function; a test after a call in the same `&&`/`||` condition keeps its narrowing.
