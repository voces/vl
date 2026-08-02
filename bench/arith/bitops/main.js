function main() {
  const n = 200_000_000;
  let x = 123456789;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = (x << 7) | (x >>> 25); // JS has no rotate primitive
    sum = (sum + ((x & 65535) | (x >>> 24))) | 0;
  }
  console.log(sum);
}
main();
