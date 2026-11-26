## Infrastructure (Track F)

- The IR passes a lifted nested callee the captures an un-lifted closure (one bound in a
  module-scope block) holds in its environment, read at the callee's rep (`callee captures env`
  10 → 0, 0 lost; lane COV-CLOS).
