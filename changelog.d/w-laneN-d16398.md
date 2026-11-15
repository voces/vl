## Codegen, memory & runtime (Track B)

- **D16398 closed:** a record literal delivered into a union arm whose fields hold one-function
  records of different function types is boxed as that arm, where it built an invalid module.
