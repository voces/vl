## Codegen, memory & runtime (Track B)

- **D16722 closed:** a record field holding an empty list joined with `null` records the `i32[]` its code stores as its storage type, so its rep derives the code and the hole-list fallback is gone (rep ADT stage 3; two of three kept classes remain, behind slot-store stage 3).
