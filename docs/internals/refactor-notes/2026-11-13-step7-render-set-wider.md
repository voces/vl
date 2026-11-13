# Step 7, lane H: the render-parse census counts every spelling renderer, 2026-11-13

The census counted one renderer, `tyToEmitName`. Lane I found `arenaEmitName` rendering through
`tyToNominalName` and `canonEmitNameOfTy`, which the census never saw. "Renders down to the floor"
is only measured if every render entry point is counted.

## The change

- **`RENDERERS`**: the entry points whose spelling a later decision reads (a name, a row key or a
  pin): `tyToEmitName`, `tyToNominalName(At)`, `canonEmitNameOfTy`, `canonUnionKeyTextOfTy`,
  `canonUnionKeyAtomOfTy`, `unionSpellingOfTy`, `cloSigNameOfTy`, `rlRowNameOfTy`,
  `monoPinSpellNoAnon` and `monoPinSpellShaped`. Code `ty-render`.
- **`DISPLAY_RENDERERS`**: `tyToStr`, `tyToStructStr` and their `User` forms, which render for a
  message. Code `ty-render-display`, counted apart.
- **Exemptions and the stale-name rule:** a renderer's own body, its `At`/`Go` variants included,
  is exempt. A listed renderer declared nowhere fails the census, as a listed parser does.
  `--parsers` prints every counted name.
- **`render-parse-origins.ts --check`** ignores a committed row whose site no longer exists. A
  deleted parse is a fall, never a failure, so a lane deleting sites need not regenerate the file
  (the coordinator's ruling that lanes stop committing it).

## Controls

- **The fixture test:** `tests/vl_render_parse_budget_test.ts` adds a `tyToNominalName` call
  (`ty-render`) and a `tyToStr` call (`ty-render-display`). Over the same fixture tree, master's
  census lists neither line and this one lists both.
- **The stale row:** a committed origins file with a row for a site that does not exist passes
  this `--check` (rc 0), and fails master's (rc 1, "is stale").

## The count

`ty-render` rises from 13 to 101 (at master 23e03fce), the same code counted honestly; 44 display renders are reported
beside it. By renderer:

| renderer | calls |
| --- | --- |
| `monoPinSpellShaped` | 36 |
| `tyToNominalName` | 22 |
| `rlRowNameOfTy` | 15 |
| `tyToEmitName` | 12 |
| `unionSpellingOfTy` | 4 |
| `canonUnionKeyTextOfTy` | 3 |
| `cloSigNameOfTy` | 3 |
| `monoPinSpellNoAnon` | 2 |
| `canonUnionKeyAtomOfTy` | 2 |
| `tyToNominalNameAt`, `canonEmitNameOfTy` | 1 each |

By file, `emit_mono` has 38, the pin spellings. A renderer's own internal helpers outside its
`At`/`Go` variants (`unionSpellingOfTy`'s member walk, say) are counted where they render; they
are named here rather than exempted by a guess.

## Regenerating the origins and the sites table at a fold

From the checkout root, after `scripts/refresh-compiler.sh` has built `build/vl-compiler.wasm` from
the folded tree (the script runs `sweep.vl -- list`, which writes the witnesses it probes):

```sh
deno run -A scripts/render-parse-origins.ts --seed build/vl-compiler.wasm --jobs 4
```

It writes `scripts/render-parse-origins.txt` and `docs/internals/render-parse-sites.md`. Then
`deno run -A scripts/render-parse-origins.ts --check` exits 0, and the budget is rewritten from the
regraded census:

```sh
vl run scripts/render-parse-census.vl --compiler build/vl-compiler.wasm -- --out "$TMPDIR/rp.json"
vl check --budget scripts/render-parse-budget-baseline.json --findings "$TMPDIR/rp.json" --write-baseline
```

A regrade can move a site between `ty-string-parse` and `ty-parse-unclassified`, so the rewrite is
part of the same commit.

