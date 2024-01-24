Add "is" operator, where right side is a type

```vl
function foo<I extends string | number>(I foo) {
    if foo is string return foo
    return number.format(foo, "#.##")
}
```

Essentially it's a ducktype variant of instanceof, replacing the need of typeof as well