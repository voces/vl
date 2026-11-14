# Generic-function rows D16110, D16150, D16151, 2026-11-14

Lane J.

## D16110: the anchor

`validateBinCstrs` asks the write-scan parent table (`cwIxParent`) for the call that passes the
generic as an argument, and refuses at that call's first argument whose value has no identity.
The refusal and its sentence are unchanged except for the `argument N:` head.

## D16150: one type parameter, many rows

Each annotation a generic resolves mints its own `TyVar` row for `T`. `tyEq` matches type
variables by name, but `tySame` matches them by index, so an `is` spelling never matched the
parameter's arm. A new `tyVarDeclOwner` column records the declaration whose parameter a row
names, where signatures (`resolveAnnotTs`) and bodies (`fnDeclPushTyParams`) mint them.
`tySameDecl` reads that column and is used only by `recIsFitsAcrossTags`. A global change to
`tySame` was tried and refused: it moves a nested generic's redeclared `T` off its `argument 1:`
head (`error-nested-redeclared-param-called-with-outer-value-operator.vl`). It also moved D4155
to `runs`, which the narrow form does not; D4155 stays filed.

`tyVarOwner` moved from `check_hole_pins.vl` to `check_types.vl`, where `tySame` can read the
new column without an import cycle. Its readers import it from there.

The emit face is a separate gap: on the call path, `bindGenWalk` never paired the members of two
unions. `bindGenRecordArms` pairs union-of-records arms by field-name set, and binds only when
every argument arm has exactly one partner.

## D16151: a closed pin type with no pin name

`monoArgTyFail` at the closed-pin check refused a loop element whose pin type (`Tree<string>`)
is closed but which has no pin name of its own. The pin now accepts a closed pin type. A
parameter that still does not close is refused by the check after it (`pinC == ""`).

## Neighbours

The concrete spellings of all three ran before this change (each row's ablation), so all three
were capability gaps, not design refusals.
