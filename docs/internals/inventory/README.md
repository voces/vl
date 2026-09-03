<!-- inventory-split: source docs/internals/silent-class-inventory.md -->

# Silent-class inventory — one file per row

`D<id>.md` per row; [`INDEX.md`](INDEX.md) lists them all; [`TEMPLATE.md`](TEMPLATE.md) is
what a new one starts from. The prose that used to sit around the rows is at the bottom of
this file, verbatim. `scripts/inventory/split.py --apply` produces all of it from
`docs/internals/silent-class-inventory.md` and proves no row lost a byte.

## How to file a row

1. `python3 scripts/inventory/ls.py --next` prints the lowest unclaimed id — but CLAIM A
   BLOCK FIRST in the reservations note below. Two agents running `--next` one second apart
   get the same answer, and that is how D976 and D978 were each minted twice in one day.
2. `cp TEMPLATE.md D<id>.md` and fill it in. The heading id must equal the file's stem;
   `split.py` and the deno test both refuse two files claiming one id.
3. The status line is the FIRST `**bold**` line and must name an outcome from the grader's
   vocabulary — `TEMPLATE.md` lists all twelve. It is what `INDEX.md` and
   `ls.py --status` report, so a title reading `[CLOSED …]` over a live status line is a
   contradiction both will show.
4. `Repro:` then a 4-space-indented program that is the row's OWN witness, never a
   paraphrase. `python3 scripts/check-filed-witnesses.py --strict docs/internals/inventory`
   runs every row's; `deno task test` checks the structure in ~15ms.
5. Closing a row EDITS ITS FILE — status line, and a `#### The close` under the mechanism.
   Nothing else in the directory changes, which is the point of the split: two PRs closing
   two rows now touch two files instead of colliding in one file's tail.

## Which rows are open

    python3 scripts/inventory/ls.py --status open      # the rows that do not run
    python3 scripts/inventory/ls.py --status silent    # check-clean invalid wasm, wrong value
    python3 scripts/inventory/ls.py --tail 10          # the most recently minted ids

## D-number reservations

Blocks of 20, claimed in the **`D-NUMBER RESERVATIONS` block of the relocated preamble
below** — one home, not two. A reservation that lives in an agent's memory instead of a file
is how two ids got minted twice on 2026-09-01. Check the id against MASTER, not your branch.
