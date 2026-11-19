## Codegen, memory & runtime (Track B)

- IR: a store into a module map global (`m[k] = v`, `.set`, a Set's `.add`) lowers through
  legacy's own store tail when its key and value take the plain arm; start bodies the IR matches
  rise from 6,895 to 6,902 of 17,038.
