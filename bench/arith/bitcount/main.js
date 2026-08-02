// JS has Math.clz32 but no popcount and no ctz; both must be emulated.
function popcnt(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >> 24) & 0xff;
}

function main() {
  const n = 200_000_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = i + 1;
    sum += popcnt(v) + Math.clz32(v) + (31 - Math.clz32(v & -v));
  }
  console.log(sum);
}
main();
