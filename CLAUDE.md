# VL — working rules

Repo-wide instructions. Subsystem detail lives in `docs/internals/`; `ROADMAP.md` owns the
forward plan, `CHANGELOG.md` the shipped work, `DECISIONS.md` the non-obvious rationale.

## `std:*` changes get a second pass — required

**Any change that adds or alters an export in `std/*.vl` MUST be reviewed by the
`std-api-reviewer` agent before it merges.** Rubric: `docs/internals/std-api-review.md`.

This is not style policing. std is version-locked to the compiler, there is no package
ecosystem to route around a bad decision, and there is **no deprecation story** — a std
name is close to permanent, so the cheapest moment to be critical is before it exists.

The review is critical of ambient/stateful APIs, order-dependent calls, boolean parameters,
silently lossy operations, names that promise more than they deliver, second error channels,
duplicated functionality, and anything speculative. **None of those is forbidden** — several
are in std today because they were right. What the review requires is that a deviation was
*chosen* and is *justified in the module header*, rather than drifting in because nobody
compared.

Not required for: a change that only touches a std function BODY without altering its
signature, name, or documented behaviour.

## Gates

The PR gate has more parts than `deno task test`. In order:

1. `deno task test`
2. `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts` — the `ci-native` job, **not** part of the above
3. `scripts/native-fixpoint.sh` and `scripts/lint-self.sh`, plus **`deno lint`** if the
   change touches a `.ts` file — CI runs it as its own step, `lint-self.sh` does NOT cover it
   (that one lints the VL module graph and runs `vl fmt --check`), so a `.ts` edit can pass
   every other gate here and still fail CI. Two rules bite in practice: `no-import-prefix`
   and `no-unversioned-import`. Note the convention they enforce — **no test under `tests/`
   imports an assertion library**; they all `throw new Error` with want/got in the message.
4. `scripts/rep-fuzz-check.sh` — **mandatory** for anything touching the rep layer or the
   interner; the corpus, the suites and the fixpoint are all blind to REJECT→MISMATCH
5. `scripts/mono-tyaram-grid.sh` for monomorphizer changes

**Read a gate by its exit code or its summary line, never by `tail -1`.** `lint-self.sh`
interleaves two halves; only `self-lint + fmt-check clean` means both passed. Never put a
gate and a commit in the same command — a non-zero exit scrolls past unread.

`vl fmt -w` takes **one path per run**; a multi-path call fails and formats nothing.

## After editing `compiler/*.vl`

Run `scripts/refresh-compiler.sh` before testing. The compiler is itself a VL program at
`build/vl-compiler.wasm`, and a stale seed silently tests the previous compiler.

## Claims about the tree

`ROADMAP.md` and the design docs go stale one-directionally — a fixed defect keeps reading
as live, because the inventory is not the file the fixer edits. **Re-run a doc's own witness
before scheduling, briefing, or quoting from it.** Every row in those files carries a
minimal program; running it costs seconds.

For any doc whose rows are `### <ID> — <title>` + a `**<status>**` line + a `Repro:` block,
that is one command:

```sh
python3 scripts/check-filed-witnesses.py docs/internals/silent-class-inventory.md
```

It runs each row's OWN filed program — never a paraphrase, which is a different program —
and prints which rows no longer behave as filed; non-zero exit means at least one moved.
It found **eight of sixteen** rows already fixed on first use. Grade the doc against it
rather than against memory, and **run the repro verbatim**: a hand-retyped witness that
differs in one type tells you nothing about the row.
