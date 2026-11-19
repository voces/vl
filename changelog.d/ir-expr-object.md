## Codegen, memory & runtime (Track B)

- IR: a record literal (a standalone struct or a variant row) whose fields are written as
  themselves lowers through legacy's own layout, in any field order; a discarded inert literal
  writes nothing on both paths.
