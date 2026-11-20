## Codegen, memory & runtime (Track B)

- **IR soundness, a box into another union's box:** the IR passes a value-union box into a box of
  another union as it stands only where legacy's box plan does (`holeBoxPlanOf` `pass`). Where the
  destination's type is unknown it misses instead. Legacy converts the members there. A capability
  probe pins the field case. No emitted byte moves.
