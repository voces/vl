## Codegen, memory & runtime (Track B)

- **IR coverage:** a shared field read over a union of records now covers every form legacy writes a member's arm in, through one classifier both sides share (`sharedArmModeOf`). An object field value its field holds as it stands is retagged, as a binding's already was. A record literal bound at a union member's type is built at that member's variant row, as legacy builds it. On master the IR's claim wrote a typed `ref.null` for such a literal's `null` field, which legacy does not write.
