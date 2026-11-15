## Type system (Track A)

- **D16182 closed:** a read of a re-pointed generic `let` handed to a closed function-typed parameter is the function its most recent write stored: `let k = plus; k = inner; apply(k)` runs. Its method-argument face (D16551) and un-annotated-parameter face (D16552) are filed open.
