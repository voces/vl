# Step 7: whether a list element is keyed nominally is asked of its type; `elemNameIsNominal` is deleted, 2026-11-12

A slice of lane B's failing floors from closing census 5, taken with B's clearance. The question
is whether a list element is one `repElemKey` keys nominally, so that a structural row cannot
stand in for it. It was asked of the element's name (`elemNameIsNominal`), and is now asked of its
type (`elemTyIsNominal`, emit_shape_rows.vl). All four callers had the type in hand:

- `fieldElemHintOf`: the field's projected element row;
- the ref-array annotation arm: `raTy`;
- the interner's field walk: the field's projected row;
- `ensureRefElemKind`'s inner list: `innerKindTy`.

**The type's line:** a newtype brand; a declared record; a record holding a tagged function, whose
row is keyed by its set; a list of one of these; a declared alias's one-member wrapper over one; or
no type at all, which declines.

**How the line was found.** A probe evaluated both answers at each call. It was built by master's
seed into scratch and never refreshed into `build/`.

- **The name's answer depends on mint order.** It disagreed with the type at the first call in
  **1,247** programs. It reads `false` for a declared record whose row is not minted yet (`Inner`,
  `Circle[]`), so its answer depends on when it is asked.
- **The output is decided elsewhere.** The plain type test (every record nominal) moved 1 program:
  `generics/hole-list-literal-in-record-field-at-two-types.vl`, an inline anonymous record, went
  runs → emit reject.
- **Declared records only.** With that, 3 programs went runs → compiler trap: records holding a
  tagged function, whose row the name knew as `#anon`.
- **The final line,** with the tagged function: **0 movers in 24,191 programs.** The 1,247
  disagreements decide no output: each declined hint is answered by the row's own type.

**Proof.**
- **Sweep:** 24,191 same, with 0 bytes-only movers, 0 output movers, 0 `runs → not-runs` and 0
  new compiler traps. The candidate side is a fixpoint seed; the base is master `87dc752a` after
  one refresh.
- **Census:** ARENA+NAME goes from 7 to 5 and NAME from 32 classifiers on 62 call sites to 25 on 51.
- **Gates:** fixpoint; `lint-self.sh` clean; `regress.vl` lost no runs;
  `check-filed-witnesses --strict` at 4,858 as filed.

**`isSName` and `spellingHasStructRow` stay.**
- `pinKindOfName` asks whether a synthesized pin name is an `#anonN` handle. That is the `#anon`
  row-identity contract census 5 passes.
- The other caller, in `emit_mono.vl`, is lane D's file. It is sent to D with its typed input, the
  field's element type `sFieldElemTyIxAt(rsi, fi)`.
