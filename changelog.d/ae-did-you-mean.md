## Type system (Track A)

- **D16686 closed (ROADMAP Next item 9):** an undeclared name suggests the nearest value in scope (`undeclared identifier 'coutn'; did you mean 'count'?`), covering locals, globals, functions, imports and the builtin calls; failing that, the nearest std or program export with its import line; a type read as a value says it names a type, and a type is never offered for a value. A missing field names the nearest declared one. Suggestions are text only, so no quick-fix or `--fix` applies them.
