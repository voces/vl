## Type system (Track A)

- **Record-union field read through a hole function:** an un-annotated function reading a field shared by its record-union argument's members returns the join of their field types (was an open hole at the call: such results checked against any destination and built invalid wasm, or were refused at emit when handed on).
