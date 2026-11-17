## Codegen, memory & runtime (Track B)

- **D16720, D16721, D16722 closed:** every record field's code is now the one its storage type derives. A field stored at a bare hole or type variable, or as an empty list joined with `null`, records the `i32` or `i32[]` its code stores, and a function field stores its storage type's code; no field keeps a stored code its rep does not give (rep ADT stage 3, without waiting on slot-store stage 3).
