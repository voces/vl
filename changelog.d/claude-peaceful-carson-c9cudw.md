## Infrastructure (Track F)
- **Plumb-shape cost baseline re-read from a fixpoint master seed:** main fuel 9.44G, tail 6.84G. Master had drifted +3.6% across merges, none of which crossed the +5% bar alone. Each PR is graded on its own delta again.
- **Distilled baseline re-read for one cell:** `d16121_argument_unann` moves from a loud check reject to a loud emit reject, filed as D16807 (the read-only map floor lift, L2 S3.4a, let it past check; emit's union-rows sentence now refuses it). No runs lost.
