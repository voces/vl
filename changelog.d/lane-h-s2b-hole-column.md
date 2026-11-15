## Infrastructure (Track F)

- **An open collection child is a hole, and a pin solves it** (type hash-cons stage 2b): list
  elements, map keys and values are read through `tyElemOf`/`tyKeyOf`/`tyValOf` and tested with
  `tyOpen`, and the 33 empty-collection pins write a hole column instead of the row. Output
  byte-identical.
