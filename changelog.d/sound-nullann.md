## Type system (Track A)

- **Redundant-annotation hint:** no longer fires on a list of only `null` (`const b: null[] = [a[k], a[1]]`, a list of a never-written `null` binding, or an `if` of such lists), where removing the annotation is refused with "a list of only `null` has no element type".
