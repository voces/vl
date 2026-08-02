// binary-trees — adapted from the Computer Language Benchmarks Game
// `binarytrees` program (the single-threaded, no-arena reference shape).
// Idiomatic JS: plain objects with two fields, recursive build and check.

function bottomUpTree(depth) {
  if (depth === 0) return { left: null, right: null };
  return { left: bottomUpTree(depth - 1), right: bottomUpTree(depth - 1) };
}

function itemCheck(node) {
  const l = node.left;
  if (l === null) return 1;
  const r = node.right;
  if (r === null) return 1;
  return 1 + itemCheck(l) + itemCheck(r);
}

function main() {
  const n = Number(Deno.args[0] ?? 20);
  const minDepth = 4;
  const maxDepth = Math.max(minDepth + 2, n);
  const stretchDepth = maxDepth + 1;

  console.log(
    "stretch tree of depth " + stretchDepth + "\t check: " +
      itemCheck(bottomUpTree(stretchDepth)),
  );

  const longLivedTree = bottomUpTree(maxDepth);

  for (let depth = minDepth; depth <= maxDepth; depth += 2) {
    const iterations = 1 << (maxDepth - depth + minDepth);
    let check = 0;
    for (let i = 1; i <= iterations; i++) {
      check += itemCheck(bottomUpTree(depth));
    }
    console.log(
      iterations + "\t trees of depth " + depth + "\t check: " + check,
    );
  }

  console.log(
    "long lived tree of depth " + maxDepth + "\t check: " +
      itemCheck(longLivedTree),
  );
}

main();
