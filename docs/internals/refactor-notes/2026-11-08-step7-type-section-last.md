# Step 7: the type section is written after the bodies

Measured 2026-11-08 on a 4-core box, master `49986e21`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,740 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,740 same; 0 bytes-only, 0 output movers |
| seed bytes | 6,570,503 | 6,570,693 (+190) |

## What moved

`emitTypeSection` used to write the type section first, into the module rope, before the
import, function, global and code sections. Now it renders twice. A dry render runs where the
section used to be written, and is discarded. The placed render runs after the code payload is
built and after the global and function sections are framed. It goes in with `wSectionPartsAt`
at the chunk the section used to occupy. It is placed last of the three late-framed sections and
at the lowest chunk, so the other two do not move.

The bodies read two facts that the type section's rows decide. Both are now built up front:

* `sSuper`/`sSubbed` (`buildStructSupers`) gives each row's supertype, which the casts read. The
  first candidate built it inside the late render. Five programs then stopped running with
  invalid wasm, and D15057 printed nothing.
* The `$fnsig` pool's twin column (D351) used to be computed while the section was rendered.
  Now `cloSigTwinsBuild` computes it over a scratch render of the pool, gated on `fnValUsed`
  as the pool's allocation is.

The dry render exists only for diagnostics. A program that the section and a body both refuse
reports the section's refusal first, as before. Without the dry render, D3938's message moved.
The placed render is skipped once emission has failed.

## What this buys collectA#2, and what it does not yet

Every heap type's bytes are now written after every body. So a type minted during the bodies,
on first use, would reach the section. That is not enough by itself, for two reasons:

* `typeOffset`, the functype base, is still fixed before the bodies. The import section entries
  (the print functypes) and the function section entries (`typeOffset + fi`) are built from it
  pre-code. A heap type minted inside the rec group shifts every functype index. The next PR
  builds those two entry lists after the bodies, as the type section now is.
* The dry render must go once a flag stops being decided before the bodies. Its refusals then
  move behind the bodies'. That is a message-order mover, to be measured when it lands.

After those, each flag group (`mUsed`, `ba8Used`, `fa32Used`, `fa64Used`, `ia64Used`, `slUsed`,
`lUsed`, `aUsed` last) becomes a minting accessor and its setters are deleted, one group per PR.
`typeOrderRun` already reorders the first group by key, so a type minted later than today
should land at the same final index in most modules.
