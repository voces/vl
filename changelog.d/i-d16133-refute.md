## Type system (Track A)

- **D16077 and D16133 closed:** a lambda returning a generic, handed to a hole parameter whose result is called, runs: `function run(f) { print(f()(5)) }; run(() => inc)` prints `6`, and with a second callee `run2(() => inc)` both run, where each was an emit reject. The elaboration closes the lambda at the generic's delivery, and the tag decision after it declines a set holding such a lambda, so the call site builds a closure. One parameter handed two lambdas (D16130), two parameter lists (D16079) and a `const` lambda or named maker (D16131) are still refused.
