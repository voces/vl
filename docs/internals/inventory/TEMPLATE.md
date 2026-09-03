<!-- Copy this file to `D<id>.md` and fill it in. Not a row itself: the `D*.md` glob that
     feeds every consumer does not match `TEMPLATE.md`. -->

### D0000 — one sentence naming the MECHANISM, not the message

**loud emit reject · 3 cells of the `d0000` grid · filed 2026-09-02 against master `abc1234`**

Repro:

    const xs: i32[] = [1, 2]
    print(xs[9])
    // vl check: rc 0.  vl run: wasm trap, out of bounds

#### Mechanism

What decides the outcome, and where. One paragraph. A validator sentence is not a
mechanism — let the ABLATION define the family, never the message.

#### Ablation

| ingredient removed | outcome | needed? |
| --- | --- | --- |
| the annotation on `xs` | still refuses | no |
| the out-of-range index | runs | **yes** |

#### Grading list

Programs this row's close must re-grade, beyond its own witness — the un-annotated
spelling, the second delivery position, the sibling row this was predicted to fix.

<!-- THE RULES THE GRADERS ENFORCE, all of them cheap:

  * The heading is `### D<id> — <title>` and `<id>` MUST equal the file name's stem.
  * The FIRST `**bold**` line is the status line and must contain one of the grader's
    outcome phrases: `closed`, `runs today and must keep running`,
    `now a loud check reject`, `now a loud emit reject`, `loud check reject`,
    `loud emit reject`, `check-clean invalid wasm`, `check-clean silently wrong`,
    `check-clean wrong evaluation`, `compiler trap`, `loads then traps`,
    `trap after load`. Do not negate one: `not closed` grades as `closed`.
  * A `check-clean silently wrong` row must carry a `// PRINTS <text>` line in its repro.
  * `Repro:` then a 4-space-indented program. A multi-module witness splits with
    `// file: <name>.vl` markers; the LAST section is the entry.
  * At most three `####` sections, in this order: mechanism, ablation, grading list.
-->
