# START-2: a field store on its receiver's own row (2026-11-26)

Regeneration 9's two field-row programs, `field store coercion` there and `field store receiver
rep` since #10315, are both fully claimed, graded on master 44be9fd1.

Both receivers are built at a record row other than their type's: a hole parameter delivered
wider (`two(v)`, typed by the call's wider `B`), and a record a join widened (`mk2()` read where
`{f: i32 | null, g: i32}` is its type's row). `fieldStore` chose the type's row whenever the field
fit there, and then required the receiver at that row. It now first takes the receiver's own row,
where that row holds the field at a rep the value fits, which is the struct legacy's `struct.set`
writes.

The first attempt converted the receiver to the type's row through `irConvert`. That only renamed
the miss (`convert record -> record`), and a row copy would write the field into a copy, so it was
withdrawn.

`ir-parity --run-all --behaviour-only`: byte-identical on both programs and on the sweep, which
misses `field store receiver rep` twice on master.
