## Type system (Track A)

- **D16746 closed:** a range loop (`for i in a until b`) inside a function instanced at an un-annotated or generic parameter no longer fails at emit with `identifier is not a parameter, local, or global` when its body reads an element of the parameter. Each mono rewrite of the loop now stands for the template's loop.
