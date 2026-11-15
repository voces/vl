## Type system (Track A)

- **holeBind walk owns its state** (`refactor-notes/2026-11-15-relate-g2a-hole-bind-walk.md`): the six
  module registers of the hole-binding read become one `HoleBindWalk` per read, so a read nested in
  a call's typing no longer resets an outer read's counts. `holeChoice` needs no row: its arm choice
  is a pure syntax decode. Output unchanged on 20,478 programs.
