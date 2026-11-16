## Infrastructure (Track F)

- **The inference-hole query has no depth budget** (type hash-cons stage 6b). Every caller asks
  one walk that visits each union and record once, so a type nested past eight levels no longer
  reads as holding a hole. Output is byte-identical, and the self-compile is slightly cheaper.
