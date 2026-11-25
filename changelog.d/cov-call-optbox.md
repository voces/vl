## Codegen, memory & runtime (Track B)

- **IR claims `p?.f ?? d` over a union box field and over a record field:** two new `??` arms share legacy's plans and tails. `coalesce optional record field` falls from 31 rows to 0 on its 27 programs.
