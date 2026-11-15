## Type system (Track A)

- **D16395 closed:** `==` between records of different field sets is a check error, as the owner ruled: "`A` and `B` have different fields (`g`); compare the fields you mean". Before, it was refused at emit, or built an invalid module for nullable records. Filed D16397: the same compare in a generic body, which is still refused at emit.
