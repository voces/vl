## Codegen, memory & runtime (Track B)

- **IR builds a returned record literal at the function's declared result row:** take a maker like `function mk() { return { r: { f: inc0 }, s: { f: dbl } } }`, whose literal is laid out at one struct row while the function's result is declared at another. The literal is now built at the result's row, by that row's layout, instead of missing `convert record -> record`. A list of its results then reads by that row (D17671). A call result bound to a `let`, or stored into a list at another row, is filed as D17677.
