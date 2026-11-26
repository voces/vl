# A literal-union key of a string-keyed map (lane COV-UNION, 2026-11-26)

## The refusal

A string-keyed map operated on with a `K` value, where `K` is a literal union held as its interned
atom: `m.set(a, 3)`, `m[r.k] = n`, `m[k] ?? 0`, `m.get(k)`, `m.has(k)`, `m.delete(k)`. Legacy's
one key gate (`mapKeyArmOf`) answers `atom` and widens the key to its member text, the widen
`print` shares (D1724). The IR's has, delete, set, `??` read and get sites admitted only `plain`
and `i64`, so they refused (`map key atom`).

## The change

`mapKeyAt` delivers a key whose arm is `atom` at the `str` rep, which builds the atom decode
(`RAtomStr`). The has, delete, set, `??` read and get sites admit the `atom` arm. The compare and
join sites (`scalarMapEq`, `coalMapScalarJoin`, `coalOptMapField`) and the print path keep
refusing; no program in the class reaches them.

## Measured

Each arm runs from its own checkout: master `fa5d6e86e` from a base worktree, and this tree. The
population is tests/cases plus regen-10's COV-UNION programs.
- `map key atom` 5 → 0. No other class moved.
- tests/cases:
  - unclaimed distinct functions 221 → 217;
  - start bodies 125 → 124;
  - programs fully claimed 7,916 → 7,919.
- D1724's witness (`take`, the sixth regen-10 row) is claimed: `VL_IR_REQUIRE_CLAIM=1` exits 0.
- `ir-identity.sh --cases`: differ 0.

Q58 sweep: `tests/cases/maps/atom-key-of-string-map-positions.vl`.
- Positions: `.set`, an index store and read, `.get`, `.has` and `.delete`, from a parameter, a
  record field, a narrowed local and at the top.
- An older master seed blocks 4 functions and the start body. This tree has blockers none and
  matches under `VL_IR_SHADOW=6`.
- `VL_IR_REQUIRE_CLAIM=1` exits 0, and the `@log` lines match under `VL_IR_STRICT=1`.
