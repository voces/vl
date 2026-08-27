#!/usr/bin/env python3
"""D183, re-minimised: the union and the sink both turned out NOT to be required."""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
F, E = {}, {}


def add(k, v, e="7"):
    F[k] = v
    E[k] = e


STD = 'import { reverse } from "std:array"\n'
add("m_min", STD + '''function rd() {
  const c = ["seven"]
  const dd = reverse([c])[0]
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_index", STD + '''function rd() {
  const c = ["seven"]
  const dd = reverse([c])[0]
  if dd[0] == "seven" { print(7) } else { print(0) }
}
rd()
''')
add("m_ann", STD + '''function rd() {
  const c: string[] = ["seven"]
  const dd = reverse([c])[0]
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_annd", STD + '''function rd() {
  const c = ["seven"]
  const dd: string[] = reverse([c])[0]
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_i32", STD + '''function rd() {
  const c = [7]
  const dd = reverse([c])[0]
  let hit = 0
  for zz in dd {
    if zz == 7 { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_nostd", '''function rd() {
  const c = ["seven"]
  const dd = c
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_generic", '''function idg<T>(x: T): T { return x }
function rd() {
  const c = ["seven"]
  const dd = idg(c)
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_directforin", STD + '''function rd() {
  const c = ["seven"]
  let hit = 0
  for zz in reverse([c])[0] {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_reverse_flat", STD + '''function rd() {
  const c = ["seven"]
  const dd = reverse(c)
  let hit = 0
  for zz in dd {
    if zz == "seven" { hit = 7 }
  }
  print(hit)
}
rd()
''')
add("m_mod", STD + '''const c = ["seven"]
const dd = reverse([c])[0]
let hit = 0
for zz in dd {
  if zz == "seven" { hit = 7 }
}
print(hit)
''')

for k, v in F.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
json.dump({"expect": E, "coords": {k: {} for k in E}},
          open(os.path.join(OUT, "manifest.json"), "w"))
print("cells:", len(F))
