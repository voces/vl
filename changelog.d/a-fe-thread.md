## Type system (Track A)

- **D16061 closed: the field recorder no longer resolves an element's name (step 7).** A list of literal unions hands over its projected row, and an anonymous record's ref-list field hands the element type its key was rendered from. So every named field element arrives with its type, and `recordFieldElemRow`'s spelling fallback is deleted. Two `isValueUnionName` sites in `iisPushFieldElem` ask `valueBoxOfTy` of the type in hand.
