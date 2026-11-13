# Step 7 L2: two of the typed instance key's three named floors, 2026-11-13

After #7699, the typed instance key (`monoTypedInstKey`) is built from canonical type keys, apart
from three tests that still read text. The coordinator ruled on each one. This cut takes two of
them. The third, `monoAnonPinDiscrim`, gets its own cut next (ruling (a)).

## `monoSigPinDiscrim` becomes an assertion

The function appended a function argument's canonical key when the pin was mono's `$fnsig` key
(`=>…`). That key is shared by `i32`, `boolean` and a literal union (D3167).

Both `monoMakeInstance` callers run `monoPinRespell` first. It replaces every pin whose type the
naming rule can spell. So a `=>i>i` pin, which `call1(inc, 4)` produces, reaches the key as
`(i32)=>i32`. Its `=>` test was true 0 times over 24,070 programs.

The function is deleted. `monoKeyPinSeg` refuses such a pin with `emitFail` instead.

**Control.** A compiler with `monoPinRespell` disabled fires the new refusal on `call1(inc, 4)`.
The real compiler does not fire it.

## `monoTypedExtra` keys explicit bindings by type

The key's explicit and defaulted bindings (`monoKeyExtra`, `tp=spelling;`) were re-keyed by
zipping their text against `exBN`. Those are two different lists:

- the text holds only the type parameters no value parameter mentions;
- `exBN` holds every closed binding.

So `localT<i32, string>(a)` gave one text entry against two `exBN` entries, and the spelled text
went into the typed key as it was.

Each writer of `monoKeyExtra` now records the binding's name, type and text in columns beside
the text (`monoKeyExtraAdd`), and `MonoInstKey` carries them. `monoTypedExtra` keys each binding
by its canonical type, and keeps the text only for a binding with no closed type.

**That kept text is a named floor.** It is an open binding naming the enclosing instance's type
parameter: 22 decisions in 12 programs.

- **Contract:** "a type that holds a type parameter is not a rep" (§3.4, as ruled in #7654,
  `2026-11-12-step7-vkind-uncovered-storage-rows.md`). An open binding has no closed type to
  key by, so its text names the type parameter it stands for.
- **Witness:** `tests/cases/generics/param-copied-into-two-type-params-called-apart.vl`. It
  reaches the floor and runs, printing `w`, `3`, `v`, `4`.

## Measured

A probe ran old and new `monoTypedExtra` side by side over the population:

- 114 decisions in 59 programs give the same key;
- 5 decisions in 5 programs give a different key;
- 22 decisions in 12 programs keep open text.

All 15 programs those touch were built with a base compiler and with this cut's: the 5 that
differ, the 12 with open text, and the 3 with the old count mismatch. All are byte-identical.

The seed is 75 bytes larger.

## Counts

- Named floors left in the typed key: 1, `monoAnonPinDiscrim`, which converts next. The open
  bindings' text is that floor's sibling.
- pin-helper: 908, unchanged (`monoSigPinDiscrim` deleted, `monoKeyExtraAdd` added).

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`: all 23 rows pass;
  - `mono-tyaram-grid.sh`: 0 BAD.
- **CI's sweep** should report no movers.
