# Family B (SOUND's yield pass): an instance's nested literal mints inner-first (2026-11-25, lane COV-START)

Family B was nine rows filed under "no interned struct row for an inferred record holding a hole
fn". A scratch build (never committed) logged `anonMintLiteral` and `anonMintRowFor` into the
refusal sentence: each field's code, the literal's own type and adopted rep, and the row. That
split the family five ways:

| mechanism | rows |
|---|---|
| an instance's outer literal minted before the literals it holds (this PR) | D17128, D17171; D17170 moves on |
| a field holding a list of never-called hole functions gets field code -1 (`anonMintRowFor`) | D17384 |
| a literal minted only under its adopted rep, while a consumer's type is the literal's own | D17180, D17114 |
| a call through a returned record's field does not pin a hole function | D17129 |
| a two-signature bundle stored and read back | D17174, D17175 |

## The mechanism

`mintPinnedObjLitsIn` minted a literal before walking its children. In a hole maker's instance,
the outer `{ r: { f: f } }` coded field `r` before the inner literal had a row (field code -1), so
the outer minted no row and resolved to another. The refusal was `object literal field count does
not match struct`. The walk now mints a literal after the literals it holds.

## Measured

- D17128 and D17171 run, printing `4`; legacy and `$VL_IR_STRICT=1` agree.
- D17170 moves from `ref valtype with no interned shape` to `a union's value-box verdict is read
  off neither its member set nor its type`. D17180's ablation names that refusal as another
  mechanism: the literal-or-`null` row.
- `distilled/regress.vl`: no runs lost. Its movement list is identical on master's seed and on
  head's.

## Left

- Two different makers in one program, `mk(f) { { r: { f }, s: { g } } }` beside
  `one(f) { { r: { f } } }`: the second maker's inner literal reuses the first's row
  (`sLitIdRow`), and its outer still codes `r` at -1. This refused on master too. Reading the
  reused row from `structIndexOfObjCtxGo` was tried and does not reach it.
- The other four mechanisms above.
