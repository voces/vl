## Codegen, memory & runtime (Track B)

- **IR coverage, a box into a field's union:** a struct or variant field given a value that is
  already a union box builds through the IR where legacy passes the box whole: the checker's
  recorded box first, else `holeBoxPlanOf` `pass` at the field's site union, which legacy and
  the IR now read from one function per receiver kind. 30 more self-compile functions are built
  by the IR. No emitted byte moves.
