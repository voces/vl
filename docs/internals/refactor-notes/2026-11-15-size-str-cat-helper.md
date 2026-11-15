# A 3+ part string chain is one call of a shared helper, 2026-11-15

Lane P, binary size. Found by a fresh code-shape profile of master `37b47ca12`'s `--names`
seed, after the first four items of `2026-11-15-size-push-grow-outline.md`.

## The pattern

`a + b` already calls `__str_concat__`. A chain of three or more parts was lowered entirely
inline by `emitStrCatN`:

1. stash every part in a scratch local;
2. sum their lengths;
3. allocate one exact-fit backing;
4. `array.copy` each part in at a running offset;
5. build one header.

That costs about 33 bytes per part. The seed held about 2,000 such chains and 9,500 copies:

| parts | 3 | 4 | 5 | 6 | 7 | 8–19 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| chains | 988 | 313 | 273 | 125 | 97 | 177 |

## The change

In a plain build, `emitStrCatN` still evaluates the parts left to right onto the stack, then
makes one call:

- **3 to 8 parts:** `__str_cat_<n>__(s0, …, s(n-1))`, one tail helper per arity, minted on first
  ask (`helpStrCatFn`, `HELP_STR_CAT + n`). Its body is the old inline chain over its parameters.
- **More parts, up to the literal operand cap (`NEW_FIXED_MAX`):** the parts go into one
  `array.new_fixed` of the string array type and `__str_cat_arr__(parts)` (`HELP_STR_CAT + 0`)
  loops over it.
- **Past the cap:** the chain stays inline.

An uncapped family failed `vl_scaling_shape_test`'s 2,000-part chain: a `__str_cat_2000__` has
more parameters than an engine accepts.

The chain still allocates one backing and one header, now inside the helper. `-O` keeps the chain
inline. It is a new `gOptimized` reader, registered in `vl_opt_after_link_test.ts` and in
s5-per-module-artifacts.md.

## Measurements

Base is master `f195dacbc`'s fixpoint. The candidate is its own fixpoint (r2 == r3), and
`native-fixpoint.sh --pair` holds.

| reading | master | candidate |
| --- | ---: | ---: |
| seed | 6,403,641 B | 6,003,918 B (**−6.24%**) |

## A shape that is unsafe: one shared backing for the string pool

Item 4 of the profile was the string pool's start function, 5,273 nested `__str_fill__` calls
(about 32 KB), each copying one pooled string's bytes into that string's own backing. The cheap
rewrite would give every pooled string one shared backing, filled by one `array.init_data`, with
each string a view into it. It would save about 20 KB and some start-up time.

**It is unsound as the tree stands.** `emitStrAccAppend`, the loop-local string accumulator,
appends in place whenever `start + len + added` still fits inside the backing. Its soundness
argument is that an accumulator only ever holds a literal, a fresh concat result, or a buffer it
allocated. A literal is safe only because its backing has exactly its own length, so the test
always grows it. With a shared pool backing, a literal held by an accumulator would show slack,
and the append would overwrite the pooled strings stored after it. Do not retry the shared
backing without first changing the accumulator's test, for example by tracking its own
capacity rather than reading the backing's length.
