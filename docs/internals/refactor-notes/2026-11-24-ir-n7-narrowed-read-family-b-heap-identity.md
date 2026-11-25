# Handoff: `narrowed read` family B is a heap-identity item, not a retag (2026-11-24, lane IR-N7 → IR-M1)

Family B of the `narrowed read` remainder (#9952 covered A, F and C/D) is a seated record → record
read of a callback parameter over a list whose element row differs from the parameter's row. The
queue ruled it goes to IR-M1, behind its queued heap-identity items: nothing retags by shape.

| tests/cases program | functions |
|---|---|
| lists/annotated-callback-over-built-list | 1 |
| lists/map-identity-callback-over-built-list | 2 |
| unions/null-member-of-a-stored-box-field-prints | 1 |

Witnesses (both run today on legacy and print `null`):

    // B1
    type J = { f: i32 | null }
    function mk2() { return { f: null } }
    const dA: J = mk2()
    const src = [mk2()]
    const ns = src.map((y) => y)
    print(ns[0].f)

    // B2
    type J = { f: i32 | null }
    function mk2() { return { f: null } }
    const dA: J = mk2()
    const src = [mk2()]
    function show(z: { f: null }) { print(z.f) }
    const s = src.filter((y: { f: null }) => {
      show(y)
      return true
    })

Ablation: removing `const dA: J = mk2()` removes the miss; a direct call `show(mk2())` covers.

Measured on a diagnostic seed at master `637158ab8` (the miss in `narrowedLocalRead`, read seated
on the `local` arm):

| witness | own rep `recHeapOf` | own rep type | asked rep `recHeapOf` | asked rep type |
|---|---|---|---|---|
| B1 | 0 | 335 | -1 (no heap) | 348 |
| B2 | 0 | 335 | 1 | 348 |

Legacy holds both as one struct: `$__lambda_0 (param (ref $1)) (result (ref $1))` returns
`local.get $0`, no cast. The IR's two reps share no heap (B1: none on one side; B2: two heap ids
whose struct types agree only by shape), so a retag here would rest on shape alone. The close is
the heap-identity join of the row `{ f: null }` and `J`'s `{ f: i32 | null }` built from one
`mk2()`.
