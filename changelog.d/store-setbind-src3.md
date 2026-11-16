## Type system (Track A)

- **One storage decider, shared type parameters:** in the check-time set-binding shadow, a parameter annotated by a type parameter another parameter shares now takes the join of its arguments: a set only where the check joins one (`fnTagSharedJoinSet`), else a closure. Over 6,502 `@run` programs, check-only calls fall from 55 to 44 and check-only set ids from 30 to 22.
