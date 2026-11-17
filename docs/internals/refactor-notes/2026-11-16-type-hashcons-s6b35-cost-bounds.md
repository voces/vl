# Type hash-cons stage 6b, tier 2: two walk limits kept as cost bounds (lane HASH), 2026-11-16

Two reached limits were converted, measured and backed out. A path made `tySameAt` dearer
(s6b30), and `callBuiltTy` exponential or quadratic (s6b32). A cost bound is a legitimate limit
only where the answer at the cut is conservative and a program one level deeper still runs. Both
pass, so both stay as intentional cost bounds. Each carries a one-line reason at its bound, and
both leave the convert queue. The `walk-limit` lint still counts them, so the baseline holds them.

## `tySameAt` (`check_types.vl`, `depth` 24)

- **Answer at the cut:** `false`, "not the same type". A caller then treats the two as distinct: it
  keeps two rows or converts between them, and is never unsound. Most deep equal types are one
  arena index under hash-consing anyway, and `a == b` answers before the bound.
- **Witnesses one level and more past the cut,** on master's fixpoint seed:

| witness | depth 20 | 24 | 25 | 26 | 30 |
| --- | --- | --- | --- | --- | --- |
| a function returning one of two equal nested-record literals, read at the leaf | runs, `3` | `3` | `3` | `3` | `3` |
| a declared nested type and its `| null`, bound to literals | runs, `7` | `7` | `7` | `7` | `7` |
| a list of two equal nested-record literals with an `f64` leaf | runs, `4` | `4` | `4` | `4` | `4` |

  A recursive alias assigned to a structurally equal one (`L` to `M`) also runs (`3`).

## `callBuiltTy` (`check_store_rep.vl`, `depth` 8)

- **Answer at the cut:** `-1`, "no build known". Each caller falls back to its own source: the
  parameter's rep, the receiver's type, or the copy-back of D15266.
- **Witnesses past the cut,** on master's fixpoint seed, all printing the fixture's answers at
  k = 2, 6, 7, 8, 9, 10, 12 and 16:

| witness (built from the D14810 and D15266 fixtures) | k ≤ 8 | k ≥ 9 |
| --- | --- | --- |
| a wider build delivered through k functions returning the last, then written through | `5 4` | `5 4` |
| a built container's read through k hole identities, then written through | `4 9 4` | `4 9 4` |
| the same through k nested calls of one identity | `4 9 4` | `4 9 4` |
| a wider build through k `const` copies returned from a function, then written through | `5 4` | `5 4` |

Neither bound loses a `runs`. A walk without them is the design item already noted: a `tySame`
cycle check only on rows that can reach themselves, and a `callBuiltTy` memo that lives across
questions, invalidated by the record-solve tables it reads.
