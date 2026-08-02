// Struct field read/write in a tight loop, flat and nested. See main.vl.
//
// Idiomatic JS: plain object literals (V8 gives them a stable hidden class here,
// and TurboFan may scalarize the non-escaping ones).
function main() {
  const n = 300_000_000;
  const m = 200_000_000;

  const p = { x: 1, y: 2, z: 3 };
  let acc = 0;
  let i = 0;
  while (i < n) {
    p.x = (p.x + 3) & 1023;
    p.y = (p.y + p.x) & 1023;
    p.z = (p.z + p.y) & 1023;
    acc += p.z;
    i += 1;
  }

  const b = {
    pos: { x: 1, y: 2, z: 3 },
    vel: { x: 5, y: 7, z: 11 },
    mass: 1,
  };
  let acc2 = 0;
  i = 0;
  while (i < m) {
    b.pos.x = (b.pos.x + b.vel.x) & 1023;
    b.pos.y = (b.pos.y + b.vel.y) & 1023;
    b.pos.z = (b.pos.z + b.vel.z) & 1023;
    b.vel.x = (b.vel.x + 1) & 63;
    acc2 += b.pos.x + b.pos.y + b.pos.z;
    i += 1;
  }

  console.log(p.x);
  console.log(p.y);
  console.log(p.z);
  console.log(acc);
  console.log(b.pos.x);
  console.log(b.vel.x);
  console.log(acc2);
}
main();
