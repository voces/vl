## Codegen, memory & runtime (Track B)

- **IR coverage, `start: global read coercion`:** a module global's union box narrowed to a record arm reads as its box cast to the variant, as a local's does, and a literal-union global delivered where a string is wanted passes its id to the delivery's decode (tests/cases starts 29 → 16 in the class; no legacy bytes moved).
