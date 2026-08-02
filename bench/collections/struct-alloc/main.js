// Allocating many short-lived structs — the binary-trees GC-pressure shape.
// See main.vl.
//
// Idiomatic JS: plain object literals with two pointer fields. Every node is a
// real heap object for V8's generational (scavenger) GC, which is exactly the
// case this benchmark exists to measure.
function build(d) {
  if (d === 0) {
    return { l: null, r: null };
  }
  return { l: build(d - 1), r: build(d - 1) };
}

function count(n) {
  let s = 1;
  if (n.l !== null) {
    s += count(n.l);
  }
  if (n.r !== null) {
    s += count(n.r);
  }
  return s;
}

function main() {
  const maxDepth = 16;
  const rounds = 4;

  let total = 0;
  let d = 4;
  while (d <= maxDepth) {
    const iters = (1 << (maxDepth - d + 4)) * rounds;
    let s = 0;
    let i = 0;
    while (i < iters) {
      s += count(build(d));
      i += 1;
    }
    total += s;
    d += 2;
  }

  const longLived = build(maxDepth);

  console.log(total);
  console.log(count(longLived));
}
main();
