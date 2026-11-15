## Type system (Track A)

- **D16239 closed:** a walk over a map's `.values()` reads the map's value slot, so its call pins the hole functions the map holds, bare or in a record field. One classifier (`cwLoopVarSource`) now says what a `for` loop's variable reads, for the write scan and the elaboration's slot store alike; a map walk's key reads no slot. Filed D16651: a map value stored from a call or a binding, field-written and walked, is still refused.
