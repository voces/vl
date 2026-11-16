## Infrastructure (Track F)

- **Fifteen type walkers that cannot meet a cycle lose their depth caps** (type hash-cons stage 6b,
  batch 4). Each recurses only through list elements, nullable inners, map keys and values or
  function parts, never into a union's members or a record's fields, and peels no union. A cycle
  of VL types passes through a union alias or a record, so these walks stop where one would close.
  None of the caps fired in the 6a census. Output is byte-identical, and six recursive-type probes
  terminate and print the same.
