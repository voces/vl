## Type system (Track A)

- **D16077 closed:** a lambda returning a generic function, handed to a parameter with no written type that calls its result (`function run(f) { print(f()(5)) }; run(() => inc)`), runs, the generic built at the parameter list those calls take (was "call to unknown function"). Two parameter lists (D16079), two different functions handed to the parameter (D16130) and a `const` or named maker (D16131) are filed.
