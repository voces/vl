#!/usr/bin/env python3
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probes4")
os.makedirs(OUT, exist_ok=True)
P = {}

# Is the numeric nullable box broken generally, or only as a map-index read?
for t, v in [("i32", "5"), ("i64", "5"), ("f64", "5.5"), ("f32", "5.5"),
             ("boolean", "true"), ("string", '"z"')]:
    P[f"t_local_{t}"] = f"""
function body(p: {t} | null) {{
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body({v})
body(null)
"""
    P[f"t_const_{t}"] = f"""
function body() {{
  const p: {t} | null = {v}
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body()
"""
    P[f"t_ret_{t}"] = f"""
function mk(): {t} | null {{ return {v} }}
function body() {{
  const p = mk()
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body()
"""
    P[f"t_elem_{t}"] = f"""
function body() {{
  const xs: ({t} | null)[] = [{v}, null]
  for p in xs {{ if p != null {{ print(p) }} else {{ print("N") }} }}
}}
body()
"""
    P[f"t_field_{t}"] = f"""
type W{t} = {{ f: {t} | null }}
function body(w: W{t}) {{
  const p = w.f
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body({{ f: {v} }})
body({{ f: null }})
"""
    P[f"t_mapval_{t}"] = f"""
function body() {{
  const m: {{[string]: {t}}} = Map()
  m["k"] = {v}
  const p = m["k"]
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body()
"""
    P[f"t_mapvalnul_{t}"] = f"""
function body() {{
  const m: {{[string]: {t} | null}} = Map()
  m["k"] = {v}
  const p = m["k"]
  if p != null {{ print(p) }} else {{ print("N") }}
}}
body()
"""
    P[f"t_mapdirect_{t}"] = f"""
function body() {{
  const m: {{[string]: {t}}} = Map()
  m["k"] = {v}
  print(m["k"] ?? {v})
}}
body()
"""
    P[f"t_mapvalues_{t}"] = f"""
function body() {{
  const m: {{[string]: {t}}} = Map()
  m["k"] = {v}
  for p in m.values() {{ print(p) }}
}}
body()
"""

for name, body in P.items():
    open(os.path.join(OUT, name + ".vl"), "w").write(body.lstrip("\n"))
print("wrote", len(P))
