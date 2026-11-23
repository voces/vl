## Type system (Track A)

- **D17078 closed:** a null test (`== null`, `!= null`, `is null`, an early `return`) narrows an `if` join of un-annotated parameters at each instance, so `if v == null { … } else { v[0] }` runs when one arm binds `T | null`. Filed D17079: `?.` over such a join is still refused at the template.
