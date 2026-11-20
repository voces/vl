## Codegen, memory & runtime (Track B)

- **IR coverage:** a `??` over a nullable value-union binding, list element or call result is built by the IR as one valued statement through legacy's shared stash, tag-test and unbox tails, its default only on the null path (corpus: 47 more functions covered; self-compile: 2).
