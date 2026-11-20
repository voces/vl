## Codegen, memory & runtime (Track B)

- **IR lowering stack depth:** a deeply nested body walk again costs the IR lowering one stack
  frame per level. #9241's door-fragment walk had added a wrapper frame, so the 600-level
  deep-nesting test overflowed V8's default stack. No emitted byte moves.
