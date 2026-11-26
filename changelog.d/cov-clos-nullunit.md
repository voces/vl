## Infrastructure (Track F)

- The IR claims an element read of a `null`-unit list: the read for its effects, then the
  destination's null, banking one element-read row as legacy does (`null unit element read span`
  21 → 0, 0 lost; lane COV-CLOS).
