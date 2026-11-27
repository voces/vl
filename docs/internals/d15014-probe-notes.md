# D15014 probe notes (COV-CALL, parked 2026-11-27)

Witness: `outer<T>` with a nested `inner<U>` and a hole lambda `g = (v) => { inner(v) }`, called
at two types, `outer` instanced twice. After I8 it refuses `cannot yet lower (argument count)`.

1. The call in `__lambda_1$1`, the hole lambda's clone in `outer`'s template slot (its first
   instance), reaches `inner$1`, an instance of `inner` (fnInstOrigin = inner) that the prune
   stubbed with no parameters (emit_mono.vl `monoNestedFnDead` -> `monoStubSlots`).
2. `monoNestedFnDead` reads only the frame's own body for the name. A lambda re-made or cloned
   for an instance has its body outside the frame's body, so the prune judged the instance dead.
3. Counting the frame's anonymous lambdas as naming it (branch cov-call-d15014, c656303b) makes
   D15014 print its Want. But the neighbour below goes from a loud refusal to an INVALID module,
   because the frame-less instance is typed with the wrong encloser's `T`: `[x, u]` is built as
   `string list`, outer's second instance, where `(i32|string)[]` is owed.

       function valued<T>(x: T) {
         function wrap<U>(u: U) { return [x, u] }
         const g = (v) => wrap(v).length
         print(g(1))
         print(g("a"))
       }
       valued(1)
       valued("s")

   `monoNestedCallFrame` answers -1 for a call from a lambda whose parent is the template slot
   (`sl == p0`). The instance is keyed with no frame, and its elaboration then reads `outer`'s
   type parameter from the last elaborated encloser instance.
4. The root is in the frame-less instance's elaboration (per-encloser typing of a nested
   generic's instance, the `elabNestedPerEncl` family): the template slot's frame must key and type
   its nested instances, as `outer$1`'s frame (slot 7, `^7` keys) already does. The prune fix in (3)
   is right only once that holds.
