# The I8 holdouts

Each program that stops running when legacy's expression emitter goes, graded as an expected
`cannot yet lower` refusal (`tests/support/holdouts.ts`, `scripts/lib/holdouts.vl`).

**One file per program**, so lanes adding or deleting different rows never conflict. A file is
`<slug>.tsv`, holding one line, `<program>\t<unit>\t<class>\t<owner>`. The program is a
checkout-relative path or, for a program a test writes inline, `tests/<file>.ts#<case>`. The slug
is the program with every byte outside `[A-Za-z0-9._-]` replaced by `_`
(`tests/ir_holdouts_test.ts` holds a file's name to its program).

The whole table, as one TSV, is `cat scripts/ir-i8-census/holdouts/*.tsv`; the boards
(`holdouts-board.sh`, `convert-board.sh`) read that.

A holdout that is no longer refused reds until its file is deleted. A file may be added only for a
program the same PR adds, a discovered gap; a program on master that stops running is a regression
and a veto (coordinator ruling, 2026-11-26; `tests/ir_holdouts_test.ts`).
