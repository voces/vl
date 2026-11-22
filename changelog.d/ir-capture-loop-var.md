## Codegen, memory & runtime (Track B)

- **IR coverage: a closure capturing a loop variable.** A closure over a `for-in` element or a range counter missed at `callee captures` or `closure env capture`, because a loop variable has no `let` and no parent binding. `cloEnvOf` and `liftCaps` now take the variable the frame's loop made, which `captureLoopNodeOf` names, where legacy's capture valtype agrees. tests/cases `callee captures` went from 40 functions to 17, and a new tests/cases program pins the per-iteration value a loop closure sees.
