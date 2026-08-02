// map-filter-reduce — callback-heavy pipeline over a large array, in the
// three spellings a programmer actually chooses between:
//
//   phase A  the builtin methods:  xs.map(f).filter(g).reduce(h, 0)
//   phase B  hand-written loops that build the SAME two intermediate arrays
//   phase C  one fused hand-written loop, no intermediate arrays
//
// Idiomatic JS. The reduce accumulator stays well under 2^53 so plain Numbers
// are exact.

function main() {
  const n = Number(Deno.args[0] ?? 20000000);

  const xs = [];
  let i = 0;
  while (i < n) {
    xs.push(i & 1023);
    i++;
  }

  // phase A — builtin map / filter / reduce with lambda callbacks
  const ys = xs.map((x) => x * 3 + 1);
  const zs = ys.filter((y) => (y & 7) === 3);
  const totalA = zs.reduce((acc, z) => acc + z, 0);
  console.log(totalA);

  // phase B — hand-written loops building the same two intermediate arrays
  const ys2 = [];
  let b = 0;
  while (b < xs.length) {
    ys2.push(xs[b] * 3 + 1);
    b++;
  }
  const zs2 = [];
  let c = 0;
  while (c < ys2.length) {
    const y = ys2[c];
    if ((y & 7) === 3) zs2.push(y);
    c++;
  }
  let totalB = 0;
  let d = 0;
  while (d < zs2.length) {
    totalB += zs2[d];
    d++;
  }
  console.log(totalB);

  // phase C — one fused loop, no intermediates
  let totalC = 0;
  let e = 0;
  while (e < xs.length) {
    const y = xs[e] * 3 + 1;
    if ((y & 7) === 3) totalC += y;
    e++;
  }
  console.log(totalC);
}

main();
