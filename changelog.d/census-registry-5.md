## Codegen, memory & runtime (Track B)

- **I8 owner registry:** `closure argument box` closed by #10356; `field read of a stored row's box` → COV-CALL (place reads at storage); `map read default rep` split by unit (coordinator 12:01): the function defaults → COV-CLOS, the two `built-record-*` `put` record defaults → COV-CALL.
