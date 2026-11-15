## Codegen, memory & runtime (Track B)

- **D16392, D16277 closed:** a call's fresh record is copied where a record holding a nullable
  reference is built (a `(() => i32) | null` field, a list of nullable records, lists, functions
  or maps), where it was refused, or built an invalid module beside a `push` or as a list element.
