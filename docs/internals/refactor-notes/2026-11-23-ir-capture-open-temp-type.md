# IR coverage: open temp types on captures (2026-11-23, lane IR-N8)

`irBLetTempTy` misses `open temp type` when a temp's type leaves a variable open. A census of
tests/cases on master 3db525436, with each of the 24 miss sites tagged, put every function hit at
the one in `irBLetTempTy`, from two capture reads:

- **A captured hole-typed bundle parameter** (10 functions). `captureRead` held the environment
  read at the read's own type, `(_) => _`, while its rep is the bundle record `capTyOf` gives.
  `capReadTy` holds it at that record when the read's type is open and the record's rep is the
  capture's.
- **A capture copied env to env with no binding frame found** (1 function). `cloEnvOf` held the
  copy at `capTyOf`, which is -1 there. It is now held at its rep's own type, as `liftCapVar`
  holds a lifted frame's.

`liftCapVar` binds `capTyOf` once (the queue's nit on #9671).

## Measured

Shadow mode over tests/cases, every `open temp type` row, master 3db525436's fixpoint seed against
this branch: functions 11 → 0, start bodies 7 → 7.

Rows: `tests/ir-shadow-rows/capture-hole-bundle-parameter.vl` (master 39 of 45 matched, branch 45)
and `tests/ir-shadow-rows/capture-forward-no-binding-frame.vl` (master 16 of 17, branch 17).

## Left

The 7 start bodies: a module binding holding a hole-lambda bundle, read at its hole type
(`global N nonnull`, 4), a closure built at `() => ((_) => _)` (1), and sites at three other
`open temp type` checks (one each).

## Legacy tails the IR calls

None new.
