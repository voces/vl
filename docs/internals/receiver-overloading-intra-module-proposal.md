# Proposal: receiver overloading inside one module (extending O1)

**Status:** proposal for an owner ruling, 2026-11-23.
**Forcing case:** `std:simd`'s integer shapes (#9678), and collections §C2.8.
**Method:** written from a four-persona debate, two rounds each, grounded in the tree. The personas were Minimalist, Library Author, Implementer and Reader.

## 1. The question

Should two functions with the same name be allowed in one module when their first parameters differ in kind? For example, in `std:simd`:

```vl
export function min(self: F32x4, o: F32x4): F32x4 { … }
export function min(self: U8x16, o: U8x16): U8x16 { … }
```

Today that is `redeclared min`, so `std:simd` spells every non-operator op with a type suffix:
- `minF32x4`, `addSatU8x16`, and the about 120 more that #9678 adds;
- called as `v.minU8x16(w)`.

## 2. What VL already does (this is most of the answer)

The debate opened on a wrong premise, that same-named methods collide everywhere. That premise was corrected in round one.

| Mechanism | Ruling | What it allows |
|---|---|---|
| **B16** | One binding per name per scope | No argument-type or arity overloading, ever |
| **B14** | Methods are UFCS (`o.f(a)` is `f(o, a)`) | A method is a function whose first parameter is `self` |
| **O4 / #3003** | Receiver-keyed **operators** | `+ - * / % ^ < <= > >=` and `[]`/`[]=` once per receiver type, in that type's own module (the orphan rule) |
| **#3005** | **Type-bound UFCS** | `v.m()` finds `m` in the receiver type's declaring module, with no import |
| **O1 (2026-10-07)** | **Receiver overloading** (`receiver-overloading.md`) | "The first parameter's head is the only overloading axis." **Imports**, or a local declaration plus imports, may share a name when their first-parameter head classes are disjoint |
| **Constraints phase 1** | Structural bounds `<T: { m(T): T }>` | Satisfaction is the existing call resolution, asked at bound-check time |

O1 already covers this:
- Each declared record, union or newtype is its own head class, so `F32x4` and `U8x16` are disjoint.
- A method call types its receiver first, then picks once; the choice never feeds back into inference.
- A plain call uses lexical scope (rule (e)). Two imports with no local declaration is refused, and the error names the method spelling.
- A generic or un-annotated receiver picks per monomorphized instance, but only when every candidate returns the same type.
- Unions across classes, nullables and anonymous records are refused.

**What remains is one gate.** Two same-named declarations in ONE module still fail `progHoistFnSig`'s bare-name `redeclared` test (`check_top_level.vl:810-813`), which O1 never touched. All of `std:simd`'s vector types live in one module, so the shipped rule doesn't reach them.

## 3. The proposal

**Apply O1's disjoint-head test to declarations within one module.** Nothing else changes about overloading. One name follows one rule wherever its candidates are declared.

| Aspect | Rule |
|---|---|
| Axis | The first parameter's head only. Never other arguments, arity or the return type (unchanged) |
| Coexistence | Local candidates must be pairwise disjoint heads, otherwise `Duplicate binding` naming both (O1's existing message) |
| Method call | O1's pick: type the receiver, look up its head once |
| Plain `min(a, b)` with two or more local candidates | Refused, with the method spelling as the fix. Rule (e) has no single local to prefer |
| Generic `self: T` candidate beside a concrete one | Refused. Head `any` overlaps every class; allowing it would be specialization |
| Generic caller `g<T>(a: T) { a.min(b) }` | O1's existing rule: allowed only if every candidate returns the same type |
| Structural, union or nullable receiver | O1's existing rules |
| Function value `const f = min` | Refused (O1) |
| Shadowing | A local binding named `min` is no candidate; ordinary scope wins (O1) |

**Symbol names.** When, and only when, a module declares two or more candidates for one name, mint ALL of them receiver-keyed (`min@F32x4`, `min@U8x16`) through the existing `opDeclName` path (`ast.vl:2594`).
- No program that compiles today contains such a module, so every existing program stays byte-identical.
- The alternative of "first keeps its plain name" was rejected 3–1, and the Implementer then switched. It makes declaration order semantic: reordering two functions would rename symbols in `--names` trap banners and `wasm-dis` output.

**Implementation sketch** (Implementer, cited against the tree):
1. Mint second and later candidates in the parser, uniformly per the rule above.
2. Swap the `redeclared` gate for `ovHeadsOverlap`.
3. Bank local candidates in `modNoteOverloads` (`driver.vl:8088`), and fan import and export specifiers out to the set.
4. Point `typeBoundSelfFnOf` (`check_demands.vl:2092`) at `ovPickFor` over the home module's set, not the first row.
5. `ufcsCallTy` (`check_member_call.vl:584`) is unchanged.

That is roughly 300–450 compiler lines plus about 15 `tests/cases/modules/overload-*` cases. The `std:simd` rename is a separate PR with its own std-api-review.

## 4. What it buys, honestly

**Kernel readability at concrete call sites:**

```vl
// today
const lo  = px.minU8x16(hi).maxU8x16(floor)
const m   = lo.gtU8x16(splatU8(thresh))
const out = lo.addSatU8x16(bias).selectU8x16(m, lo)
// proposed
const lo  = px.min(hi).max(floor)
const m   = lo.gt(splatU8(thresh))
const out = lo.addSat(bias).select(m, lo)
```

- **Surface:** about 140 suffixed `std:simd` exports become about 30 verbs per receiver. Completion on `v.` shows 30 entries instead of every shape's names.
- **Consistency with operators:** O4 already made `a + b` receiver-keyed. Since O4, a reader of `a + b` already needs `a`'s type, so suffixing `min` while `+` stays bare buys inconsistency, not safety.
- **Retyping a kernel:** changing `px` from `U8x16` to `I16x8` needs no renames.
- **Beyond SIMD:**
  - collections' `List`/`Map`/`Set` `insert`/`remove`/`contains` (§C2.8);
  - `std:buffer` views' `getF32`/`getI32` collapse to `get`.

**What it does NOT buy:**
- **Genericity.** Every SIMD op's return type follows its receiver, so a generic `a.min(b)` is refused under O1's existing rule. This is a naming change, and should be argued as one.
- **Every suffix.** `splat` (no receiver), `load`/`store` (`self: Buf`, one head, and owned by `std:buffer`) and `f32x4(…)` constructors keep their suffixes. The `std:simd` header must say in one line which names are keyed and why the rest aren't.

## 5. Comparison with other languages

| Language | Mechanism | Same name, different receiver type | Arg-type overloading | Lesson for VL |
|---|---|---|---|---|
| **Go** | Methods per type `func (v U8x16) Min` | Yes, by construction | No | VL plus this proposal is Go's model. The receiver is on the declaration line, so `grep "U8x16) Min"` navigates without tooling |
| **Rust** | Inherent `impl` blocks plus traits | Yes, per type | No | The same per-type keying. Genericity comes from traits, which VL's structural bounds play the role of |
| **OCaml** | No overloading; modules (`Float.min`) | Through module qualification only | No | The type is in the text at the cost of qualification; suffixes are VL's version of this |
| **Zig** | No overloading; `@Vector` builtins | No (builtins are generic) | No | Avoids the question by making SIMD a language builtin |
| **Kotlin / C#** | Overloading plus extension methods | Yes | Yes | Full overloading brings ranking rules and "candidate not viable" error lists |
| **Swift** | Full overloading, including by return type | Yes | Yes, plus return type | Well known for type-checker blowups. VL must never key on the return type |
| **C++** | Overloading plus ADL | Yes | Yes, plus conversions | Hijacking, with N-candidate error notes. Exactly what O1's "first head only" avoids |
| **D** | UFCS plus overloading, with anti-hijack rules | Yes | Yes | The closest relative to VL's UFCS. Its anti-hijack rule is what #3005's "never rebind an existing call" proof mirrors |
| **Nim** | UFCS plus overloading | Yes | Yes | Shows UFCS and overloading compose, at the cost of resolution complexity |
| **Julia** | Multiple dispatch | Yes | All arguments | The most expressive, and dynamic. Out of scope for a static wasm target |
| **Haskell** | Typeclasses | Through class instances | Through classes | The principled generic answer, which VL's bounds approximate structurally |
| **Odin / Jai** | Explicit proc groups | Through a declared group | Yes, in the group | An explicit opt-in. The alternative design if implicit sets are too magic |

VL plus this proposal lands with Go and Rust: one dispatch key (the receiver's nominal kind), no ranking, no conversions, and errors one signature long. The cost profile that hurt Swift and C++ comes from argument-type and return-type participation, which O1 forbids permanently.

## 6. Pros and cons

| Pros | Cons |
|---|---|
| Removes about 110 redundant spellings from `std:simd`, and the same pattern from collections and views | Grep on a bare name finds several definitions (`grep "function min(self: U8x16"` still finds one) |
| One rule for one name, whether candidates are imported or local; today's split is arbitrary | A GitHub diff shows `a.min(b)` without `a`'s type. `minU8x16` says it in text, and an LLM writing VL without a checker benefits from the suffix |
| Matches O4's operators, so `min` and `+` behave alike | Two conventions in one module (keyed verbs, suffixed `splat`/`load`/`store`) must be documented |
| Errors stay one signature long: the receiver picks before arguments are looked at | Adding a second candidate renames the first's symbol (visible in backtraces), once |
| Small: reuses O1's machinery; no new overloading concept | Buys no genericity, and generic SIMD callers stay refused |
| Byte-identical for every existing program | A linear lookup over about 140 names could cost user programs fuel that the self-compile gate won't see |

## 7. Defects the debate found in what ALREADY ships (O1)

These are preconditions, independent of the ruling. Both are unfiled.

1. **The LSP resolves O1 sets by name, so go-to-definition jumps to the wrong function.**
   - **Witness** (Reader, run on the real seed): modules `a` and `b` declare `describe(self: A)` and `describe(self: B)`, and both are imported. `vl run` correctly prints A then B. But go-to-definition on `p.describe()` with `p: A` jumps to `b.vl`.
   - **Cause:** `importedNameSources` returns a `Record` keyed by local name (`lsp/src/wasmChecker.ts:325`, `:691`), so the second import overwrites the first. `definitionAt` reads it before asking the checker (`lsp/src/features.ts:191`). `canonicalExportOf` (`lsp/src/moduleGraph.ts:445`) has the same shape, so find-references and rename are likely wrong too (not run).
   - **Fix:** a site-resolved binding query (the checker's `ufcsSiteTo`) used by definition, references, rename and hover. Add tests with two same-named candidates that fail on today's tree.
2. **Bound satisfaction reads one row, not the overload set: an order-dependent check reject.**
   - **Witness** (Implementer, run on the shipped binary): `function lo<T: { mn(T): T }>(x: T, y: T): T`, with an O1 set of `mn` over A and B.
   - Only the first-imported candidate satisfies the bound. The other is refused with "B does not satisfy `{mn(T):T}` … a `mn(self: B, …)` function in scope", though one is in scope.
   - Swapping the import order flips which one works.
   - This is the generic path `std:simd` would rely on, so it must be fixed first.

## 8. Where the debate settled the open splits

| Split | Ruling the debate converged on | Dissent |
|---|---|---|
| Overall | **Adopt, 4–0**, as "O1 extended to intra-module candidates and nothing more" | none |
| Separate import rules (no-binding imports, dot-only) | **Dropped** by all who proposed them; they would create a second overloading regime beside O1 | none after round 2 |
| Symbol naming | **Uniform mint** `min@T` when a module has two or more candidates | none after round 2 |
| Shared mask, `select` | **Key `select` on the value:** `select(self: F32x4, m: Mask32x4, other: F32x4)`, called as `t.select(m, f)`. Mask-only ops (`and`/`or`/`any`/`all`) stay on the mask, once. Don't split the mask types | Reader: keep `select` free and suffixed |
| Generic callers | **Accept O1's refusal** for v1. Structural bounds are the generic path (Implementer); no interface feature rides in on this | Reader: the refusal should suggest a concrete instantiation |
| The index | **Gate on a measurement the self-compile can't hide:** a `vl_scaling_shape_test.ts` fuel-ratio row over a module with about 140 overloaded names. If linear, land a sid-keyed index on `ufcsExportedScopeIn`/`ovSetOf` first | Library: only before the std rename, not the compiler PR |
| Preconditions | **LSP site-resolved binding (§7.1) and set-aware bound satisfaction (§7.2) before merge** | none |

## 9. Recommendation and decisions for the owner

**Recommend adopting it**, sequenced as:
1. Fix §7.1 (LSP by call-site binding) and §7.2 (set-aware bound satisfaction). Both are bugs in what already shipped, worth fixing regardless.
2. The compiler PR: lift the `redeclared` gate to O1's test, add uniform minting, the type-bound rung's set pick, and the scaling-fuel row. It must prove:
   - the `ufcsSiteTo` A/B identical on every program that compiled before;
   - `ir-identity.sh --cases`;
   - a byte-identical seed and `regress.vl`;
   - the fuel gates.
3. The `std:simd` rename PR, with std-api-review: collapse the keyed verbs and keep `splat`/`load`/`store` suffixed, with the header line explaining why. #9678's suffixed names ship first, and this renames them.

**Decisions (ruled 2026-11-23):**
- **D1. Extend O1 to intra-module candidates: yes (owner).**
  - Today two modules may each declare `min(self: U8x16)` and `min(self: F32x4)`, but one module may not. That is why std:simd, which keeps every vector type in one module, spells `minU8x16`/`minF32x4`.
  - The extension applies O1's existing disjoint-head test to same-module declarations. No new resolution rule is added.
- **D2. Uniform minting: yes (owner delegated to the coordinator).**
  - The minted symbol (`min@F32x4`) is internal and cannot be written in source. It appears only in `--names` trap banners, `wasm-dis` output and similar debug surfaces.
  - Minting every member, instead of letting the first keep its plain name, keeps those surfaces independent of declaration order.
- **D3. `select` keyed on the value: yes (owner delegated to the coordinator).**
  - `select(m, a, b)` picks lanes from `a` or `b` by a mask. Keyed on the mask, F32x4's and I32x4's `select` would share the head `Mask32x4` and collide.
  - Declaring it as `select(self: F32x4, m: Mask32x4, other: F32x4)` (called `a.select(m, b)`) gives disjoint heads, and the result type follows the value. Mask-only operations stay on `Mask32x4`.
  - This is std API surface, so std-api-review confirms the final spelling.
- **D4. §7.1 and §7.2 are preconditions: yes (owner).**
  - Both are live bugs in shipped O1, and each is being fixed in its own PR. The compiler PR in step 2 waits for both to merge.
