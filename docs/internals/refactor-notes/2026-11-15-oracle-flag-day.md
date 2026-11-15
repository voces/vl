# Oracle inputs after the return-rule flag day (2026-11-15, lane O)

#8383 made a block body return a value only through `return`, and migrated the oracle's
interpreter and most of its generators. In `oracle.ts diff`, a check refusal agrees with any
oracle outcome. So a template that still ended a block body in a bare value made every program
built from it agree without testing anything. I counted, per input, the compiled programs whose
`.err` holds a return-rule refusal (`only through \`return\``, or the A2 `discarded` warning):

| input | cases | return-rule refusals before | after |
| --- | --- | --- | --- |
| `gen_data.ts` (`mk`) | 2,000 | 2,000 | 0 |
| `gen.ts` (`tr_<type>`) | 2,000 | all; 1,780 agreed as "checker refused" | 0 |
| `gen_hof.ts` | 1,000 | 0 | 0 |
| fuzzgen.vl (`rep`) | 4,000 | 0 | 0 |
| `join-grid.ts` (`kind`) | 64 | 64 | 0 |
| `radix-float-grid.ts` (`argf64`) | 182 | 26 | 0 |
| `ruling-grid.ts` | 23 | 0 | 0 |

After the fix, on master `55151b054`'s seed:
- Fuzz, all exit 0:
  - arith: subset 1648, AGREE 1648. The 877 remaining refusals are the generator's deliberate
    ill-typed cases.
  - data: AGREE 2000, 0 refused.
  - hof and rep: unchanged.
- Join grid: 64 of 64 AGREE, 0 refused.
- Radix-float grid: 182 AGREE. Its 31 refusals are the rule's own inexact literals.
- Ruling grid: 23 of 23 agree with the compiler.
- `oracle.ts distilled`: AGREE 11156, 0 new disagreements.
- The smoke tests pass.

A gate reading AGREE cannot see this failure. The next template drift would show as a jump in
refusals, so after a language change, count `checker refused` per input.
