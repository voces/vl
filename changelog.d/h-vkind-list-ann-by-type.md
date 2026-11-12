## Type system (Track A)

- **Step 7: a list's declared element type is read off the annotation's type.** `listAnnNameOf` returned an annotation's text, on the premise that an instance's cloned body is untyped. It is replaced by `listAnnTyOf`, which reads the annotation node's recorded type, and `boolListCodeOfName` is deleted. Byte-identical over the sweep.
