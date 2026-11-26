- IR: a closure held in a module-scope block's (or any un-lifted frame's) environment now passes
  its environment captures on to a lifted nested callee, reading each from the environment at the
  callee's rep, instead of missing `callee captures env`.
