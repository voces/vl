## Codegen, memory & runtime (Track B)

- **D16720, D16721 closed:** a record field stored at a bare hole or type variable records the `i32` or `i32[]` its code stores, and a function field stores its storage type's own code, so no field keeps a stored code its rep does not give (rep ADT stage 3, without waiting on slot-store stage 3).
