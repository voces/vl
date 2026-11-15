## Codegen, memory & runtime (Track B)

- **A string chain of three or more parts is one call of a shared helper** in a plain build: `__str_cat_<n>__` for 3 to 8 parts, and `__str_cat_arr__` over one array of the parts beyond that. Before, every chain inlined its length sum, allocation, copies and header. `-O` keeps the chain inline. The self-hosted compiler's seed is 6.2% smaller.
