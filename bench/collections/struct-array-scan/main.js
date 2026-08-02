// An array of structs, scanned by field. See main.vl.
//
// Idiomatic JS: an array of object literals. All N objects share one hidden
// class, but the array holds pointers, so the scan is a pointer chase.
function main() {
  const n = 2_000_000;
  const r = 100;

  const recs = [];
  for (let i = 0; i < n; i++) {
    recs.push({ id: i, a: i & 7, b: (i * 3) & 65535, c: (i * 7) & 4095 });
  }

  let sumB = 0;
  let cnt = 0;
  let sumC = 0;
  for (let pass = 0; pass < r; pass++) {
    for (let i = 0; i < n; i++) {
      const rec = recs[i];
      sumB += rec.b;
      if (rec.a === 0) {
        cnt += 1;
        sumC += rec.c;
      }
    }
  }

  console.log(recs.length);
  console.log(sumB);
  console.log(cnt);
  console.log(sumC);
}
main();
