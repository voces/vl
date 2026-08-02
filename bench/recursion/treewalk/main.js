function build(depth, v) {
  if (depth === 0) return { value: v, left: null, right: null };
  return {
    value: v,
    left: build(depth - 1, (v * 2) % 1_000),
    right: build(depth - 1, (v * 2 + 1) % 1_000),
  };
}

function sum(t) {
  let s = t.value;
  if (t.left !== null) s += sum(t.left);
  if (t.right !== null) s += sum(t.right);
  return s;
}

const tree = build(19, 1);

let acc = 0;
for (let r = 0; r < 150; r++) {
  // Mutating the root each pass keeps the walk from being loop-invariant:
  // without this, rustc hoists all 150 walks into one.
  tree.value = (tree.value + 1) % 1_000;
  acc = (acc + sum(tree)) % 1_000_000_007;
}

console.log(acc);
