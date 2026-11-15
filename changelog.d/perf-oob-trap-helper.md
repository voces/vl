## Codegen, memory & runtime (Track B)

- **A failing list-index guard traps through one shared `__oob__` in a plain, position-free build, once its function has made a call.** The arm is `call; unreachable` instead of a reload of the backing and a read at `-1`. Leaf functions, `-O`, and builds that record positions (`--names`, `--source-map`, `vl run`) keep the inline trap. The self-hosted compiler's seed is 2.4% smaller (6,388,478 → 6,233,979 bytes), with self-compile fuel −0.15% and CPU inside noise.
