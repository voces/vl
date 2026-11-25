## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a `.push` whose value pops or pushes another list (`xs.push(src.pop() ?? 0)`) is built by the IR for any receiver, not only a local: the value first, then the receiver, as legacy orders them.
