## Type system (Track A)

- **D17062 closed:** an un-annotated lambda returned at a generic's open union result (`function keep<U>(x: U): () => U | string { return () => x }`) now checks and runs at every instance, including a third instance and a union-typed `U`, instead of being refused at the second. The first call's re-check of the return no longer writes its own instance's result as the lambda's annotation; the generic's own pass writes the open `U | string`, which each instance reads at its binding.
