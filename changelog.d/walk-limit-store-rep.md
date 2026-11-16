## Type system (Track A)

- The store-rep walks over nested literals, index chains, identity peels and `const` chains, and the pending-null-list note, visit each node or type once instead of stopping at a fixed depth.
