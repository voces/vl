## Type system (Track A)

- **Fixed D16931** (clause 2, refused → runs): a `for` over a value `if` joining two un-annotated parameters (`const r = if k == 0 { a0 } else { a1 }; for e in r { … }`) was refused at check as "for-in expects an array, a map or a string, got _ | _". The loop variables now bind the join of each parameter's element hole, and each instance walks its own union of lists; an instance whose join is not iterable is still refused there.
