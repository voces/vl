D14825 probe, not for merge. Build `compiler/entry.vl` with this tree into a probe seed, then
for each path in `files.txt`: `vl build <f> --compiler <probe> -o x.wasm` and grep
`PROBEK … ENDP`. Each token is `<why>@<name>#<read node> fn=<frame> fekey=<the rung's answer>`,
`why` being why the closed-type rung (`nodeTyAt` of the read, peeled of null) did not answer.
`census-at-cc408f34a.tsv` is the reason-only run on master; split-plan files print nothing.
