# Reserved inventory id ranges

One file per range, named `D<lo>-D<hi>.md`, holding one line in the form:

    D<lo>-D<hi>  <holder>  <YYYY-MM-DD>  <what for>

`vl run scripts/inventory/ls.vl -- --next` SKIPS every id in a live range and prints which
ranges it skipped and who holds them, so the reservation is what the tool enforces rather than
what two people remember. `--reserve` creates a range's file and `--release` deletes it;
`tests/vl_inventory_rows_test.ts` fails when a range is stale (every id in it filed), when two
ranges overlap, or when a file's name and its line disagree.

**ONE FILE PER RANGE, NOT ONE SHARED LIST.** This used to be a single `RESERVED.md` that every
lane edited, so nearly every PR conflicted on it whenever another merged. Two lanes reserving
the same range now collide as an add/add on the same path; two lanes reserving *overlapping*
ranges with different bounds merge cleanly, and the overlap test is what catches that on the
merged tree. Take a range with `--next` and `--reserve` from an up-to-date master.

**WHY RESERVATIONS EXIST.** The queue tool's own header used to say reserved blocks "remain a
coordination convention written down in the inventory README, because two agents running this
one second apart both get the same answer". That convention failed four times, and the fourth
was two sessions colliding *while actively coordinating about ids in the same conversation* —
one reserved D1510-D1519 minutes after the other had handed D1510-D1529 to a running agent.
A convention that fails inside its own coordination is not a convention, it is a missing
feature. Nothing was lost that time only because the collision was noticed before either
agent filed.

A range is cheap. Take one before minting, release it when the work lands.

**THE HOLDER IS THE SESSION NAME OTHER SESSIONS CAN MESSAGE** — the one `ListAgents` prints,
not a name recalled from memory. The first version of the list had every holder inverted:
each block was labelled with the OTHER session's name, so the column that exists to answer
"who do I talk to" sent the reader to the wrong session for all four. A session that has
restarted may answer to a new name (`vl-6a` became `vl-cb` here); check rather than assume,
and if a block is filed by one session and fixed by another, say both.
