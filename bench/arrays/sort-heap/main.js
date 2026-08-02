// sort-heap — HAND-WRITTEN heapsort (iterative sift-down), the SAME algorithm in all
// four languages. Deliberately NOT Array.prototype.sort: this measures the language's
// array read/write/compare path, not a library.
const N = 1_000_000;
const ROUNDS = 4;

function siftDown(a, start, last) {
  let root = start;
  let cont = true;
  while (cont && root * 2 + 1 <= last) {
    let child = root * 2 + 1;
    if (child + 1 <= last) {
      if (a[child] < a[child + 1]) {
        child += 1;
      }
    }
    if (a[root] < a[child]) {
      const t = a[root];
      a[root] = a[child];
      a[child] = t;
      root = child;
    } else {
      cont = false;
    }
  }
}

function heapsort(a, n) {
  let i = (n - 2) >> 1;
  while (i >= 0) {
    siftDown(a, i, n - 1);
    i -= 1;
  }
  let last = n - 1;
  while (last > 0) {
    const t = a[0];
    a[0] = a[last];
    a[last] = t;
    last -= 1;
    siftDown(a, 0, last);
  }
}

function run(n, rounds) {
  const a = new Array(n).fill(0);
  let seed = 123456789;
  let chk = 0;
  let inv = 0;
  let lastSum = 0;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n; i++) {
      seed = (seed * 48271) % 2147483647;
      a[i] = seed;
    }
    heapsort(a, n);
    for (let i = 0; i < n; i += 4096) {
      chk += a[i];
    }
    for (let i = 1; i < n; i++) {
      if (a[i - 1] > a[i]) {
        inv += 1;
      }
    }
    lastSum = 0;
    for (let i = 0; i < n; i++) {
      lastSum += a[i];
    }
  }
  console.log(chk);
  console.log(inv);
  return lastSum;
}

console.log(run(N, ROUNDS));
