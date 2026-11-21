## Codegen, memory & runtime (Track B)

- **IR: a ref list read whose element stays nullable is built by the IR (`index ref nullable element`).** Legacy's `refListGetTail` leaves such an element `(ref null …)`, or recovers it where the index place is narrowed non-null. The IR now builds the read at the nullable element, or at its inner rep when `listReadProvedNonNull` says the place is narrowed. That predicate is shared with legacy's tail. Legacy bytes are unchanged.
