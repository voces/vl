# Receiver overloading (owner ruling O1, 2026-10-07)

**The first parameter's head is the only overloading axis.** VL has no argument-type and no
arity overloading, and will not grow either. Several functions may share a name in one module's
scope only when their first parameters differ in *kind*, so a method call `x.f(…)` picks one by
the type of `x` alone. The ruling is option 2 of O1 (`builtin-methods-to-std.md` §O1), refined
by a 6–0 committee; sunpa SP-051 and the std:str / std:array name collisions are what it unblocks.

## Head classes

`string` · a list (any element type, `readonly` or not) · `Map` · `Set` · `boolean` · one
numeric class (`i32`, `i64`, `f32`, `f64`, `u8`, `u32`, `u64` together, because literals adapt)
· a function · each declared record, union or newtype name · NONE (no parameters).

A bare type parameter, an un-annotated (hole) parameter, an anonymous record, a union or a
nullable first parameter overlaps every class. A one-member alias (`type Id = i32`) is its
member's class. Two NONE candidates overlap.

## Rules

- **Coexistence.** A local declaration and imports, or several imports, may bind one name only
  when every candidate is a function and their heads are pairwise disjoint. Anything else is
  `Duplicate binding` at the later binding site, naming both candidates with module and head.
- **Method calls.** The receiver is typed first, then its head is looked up once among the
  `self`-functions; the choice never feeds back into inference. An unknown head (a nullable, a
  union across classes, an anonymous record) is refused; `x?.f()` resolves on the type under the
  `?`. A record shape declared under two names matches neither. A receiver no head names (a
  wider record) takes the one candidate whose first parameter accepts it, as a lone candidate
  would, so adding a disjoint candidate never moves it; two accepting is refused. A local
  binding named like the method (a parameter `d`) is no candidate.
- **Receivers an instance supplies** (a type parameter, an un-annotated parameter) pick per
  monomorphized instance. The body types the call by the one return type every candidate
  shares; each pin picks and checks its own candidate. A function nothing instantiates is
  refused in the entry module (a dependency's emits nothing), and one passed as a function
  value is refused, since the instance a value makes has no call to pick for — an annotated
  lambda, `(x: A) => h(x)`, is the spelling. Only a receiver that is the function's own
  parameter is re-dispatched (D3818).
- **Plain calls** use lexical scope (rule (e), owner-confirmed): the local declaration wins;
  two imports and no local is refused with the method spelling or an `as` alias as the fix.
  Resolving `f(x, …)` as `x.f(…)` (rule (c)) is a possible later widening that breaks nothing;
  `tests/cases/modules/err-overload-plain-call-two-imports/` records today's answer.
- **Refused:** a function value naming several candidates (`const g = f`, `ys.map(f)`);
  `export { f } from` of an overloaded name; a member call whose list or map receiver has no
  element type yet (`[].join(",")` beside a local `join`), pending an owner ruling.

## Where it lives

`driver.vl` banks every name with two or more targets (`modNoteOverloads`), decides each set
after the merge rewrite (`modCheckOverloads`, which needs the merged first-parameter spellings),
and banks a member call's set or its single `self`-function. `typecheck.vl`'s `ufcsCallTy`
picks (`ovPickFor`) and banks the answer through `ufcsSiteAdd`, the per-call record the emitter
and the editor read; `ovInstSite`/`ovInstRecv`/`ovInstPick` record each instance's choice.
`emit_mono.vl`'s `monoPinBinOps` makes the same pick per instance.
