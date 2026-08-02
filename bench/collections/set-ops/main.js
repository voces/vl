// Set operations over string elements. See main.vl for the shape.
//
// Idiomatic JS: a plain `Set` of strings. V8 14.9 also has the ES2025
// `a.intersection(b)` methods; the explicit membership loops are used so all
// four runtimes run the identical algorithm (VL has no set algebra).
function main() {
  const n = 100_000;
  const r = 100;
  const half = n / 2;

  const aw = [];
  for (let i = 0; i < n; i++) {
    aw.push("w" + i);
  }
  const bw = [];
  for (let i = 0; i < n; i++) {
    bw.push("w" + (i + half));
  }

  const a = new Set();
  for (let i = 0; i < n; i++) {
    a.add(aw[i]);
  }
  const b = new Set();
  for (let i = 0; i < n; i++) {
    b.add(bw[i]);
  }

  let inter = 0;
  let onlyA = 0;
  let onlyB = 0;
  for (let pass = 0; pass < r; pass++) {
    for (let i = 0; i < n; i++) {
      if (b.has(aw[i])) {
        inter += 1;
      } else {
        onlyA += 1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!a.has(bw[i])) {
        onlyB += 1;
      }
    }
  }

  let lensum = 0;
  for (const x of a) {
    lensum += x.length;
  }

  console.log(a.size);
  console.log(b.size);
  console.log(inter);
  console.log(onlyA);
  console.log(onlyB);
  console.log(lensum);
}
main();
