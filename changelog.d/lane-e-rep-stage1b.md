## Infrastructure (Track F)

- **Rep ADT stage 1b:** a record is a union arm in the rep tree by the checker's member set or
  elaboration's union-arm types alone, never by the emitter's own variant rows, so its rep is a
  fact of its type. Elaboration's arm prime now walks nested types and counts a record boxed
  beside any member. `never` is a node of its own. Byte-identical over all 12,013 corpus cells;
  the self-build's tree rebuilds fall from 70 to 12.
