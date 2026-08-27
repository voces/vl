#!/usr/bin/env python3
"""Minimise the four block-C exemplars: one change per variant, so the axis that
carries each defect is named by a measurement rather than by a story."""
import json
import os
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
F = {}
E = {}


def add(name, text, exp="7"):
    F[name] = text
    E[name] = exp


# ── family L3 : a 3-deep list of a SCALAR, built through un-annotated locals ──
RD3 = '''  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      const g2 = g1[0]
      if g2.length > 0 {
        if (g2[0]) == "seven" { print(7) } else { print(0) }
      } else { print(0) }
    } else { print(0) }
  } else { print(0) }
'''
RD2 = '''  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      if (g1[0]) == "seven" { print(7) } else { print(0) }
    } else { print(0) }
  } else { print(0) }
'''
RD2I = RD2.replace('== "seven"', "== 7")
RD3I = RD3.replace('== "seven"', "== 7")

add("L3_asfiled", 'function rd() {\n  const lv2 = ["seven"]\n  const lv1 = [lv2]\n'
    '  const c: string[][][] = [lv1]\n' + RD3 + "}\nrd()\n")
add("L3_oneliteral", 'function rd() {\n  const c: string[][][] = [[["seven"]]]\n' + RD3 + "}\nrd()\n")
add("L3_noann", 'function rd() {\n  const lv2 = ["seven"]\n  const lv1 = [lv2]\n'
    '  const c = [lv1]\n' + RD3 + "}\nrd()\n")
add("L3_allann", 'function rd() {\n  const lv2: string[] = ["seven"]\n  const lv1: string[][] = [lv2]\n'
    '  const c: string[][][] = [lv1]\n' + RD3 + "}\nrd()\n")
add("L3_innerann", 'function rd() {\n  const lv2: string[] = ["seven"]\n  const lv1 = [lv2]\n'
    '  const c: string[][][] = [lv1]\n' + RD3 + "}\nrd()\n")
add("L3_midann", 'function rd() {\n  const lv2 = ["seven"]\n  const lv1: string[][] = [lv2]\n'
    '  const c: string[][][] = [lv1]\n' + RD3 + "}\nrd()\n")
add("L3_i32", 'function rd() {\n  const lv2 = [7]\n  const lv1 = [lv2]\n'
    '  const c: i32[][][] = [lv1]\n' + RD3I + "}\nrd()\n")
add("L2_str", 'function rd() {\n  const lv1 = ["seven"]\n'
    '  const c: string[][] = [lv1]\n' + RD2 + "}\nrd()\n")
add("L2_i32", 'function rd() {\n  const lv1 = [7]\n'
    '  const c: i32[][] = [lv1]\n' + RD2I + "}\nrd()\n")
add("L2_mod", 'const lv1 = ["seven"]\nconst c: string[][] = [lv1]\n' + RD2.replace("  ", "", 1) + "")
add("L3_mod", 'const lv2 = ["seven"]\nconst lv1 = [lv2]\nconst c: string[][][] = [lv1]\n' + RD3)

# ── family LL-obj : list-of-list of an object shape, twin + unused union ──
RDO = '''  const g0 = c
  if g0.length > 0 {
    const g1 = g0[0]
    if g1.length > 0 {
      if (g1[0]).r == 7 { print(7) } else { print(0) }
    } else { print(0) }
  } else { print(0) }
'''
HEADO = "type Circle = { r: i32 }\ntype Dot = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
add("LLO_asfiled", HEADO + 'function rd() {\n  const lv1 = [{ r: 7 }]\n'
    '  const c: Circle[][] = [lv1]\n' + RDO + "}\nrd()\n")
add("LLO_notwin", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
    'function rd() {\n  const lv1 = [{ r: 7 }]\n  const c: Circle[][] = [lv1]\n' + RDO + "}\nrd()\n")
add("LLO_nounion", "type Circle = { r: i32 }\ntype Dot = { r: i32 }\n"
    'function rd() {\n  const lv1 = [{ r: 7 }]\n  const c: Circle[][] = [lv1]\n' + RDO + "}\nrd()\n")
add("LLO_bare", "type Circle = { r: i32 }\n"
    'function rd() {\n  const lv1 = [{ r: 7 }]\n  const c: Circle[][] = [lv1]\n' + RDO + "}\nrd()\n")
add("LLO_oneliteral", HEADO + 'function rd() {\n  const c: Circle[][] = [[{ r: 7 }]]\n' + RDO + "}\nrd()\n")
add("LLO_allann", HEADO + 'function rd() {\n  const lv1: Circle[] = [{ r: 7 }]\n'
    '  const c: Circle[][] = [lv1]\n' + RDO + "}\nrd()\n")

# ── family SF : struct field over a map of the arm shape ──
RDS = '''  const g1 = ((c).f)["k0"] ?? { r: 0 }
  if (g1).r == 7 { print(7) } else { print(0) }
'''
add("SF_asfiled", HEADO + "type WS1 = { f: {[string]: Circle} }\n"
    'function rd() {\n  const lv1 = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: WS1 = { f: lv1 }\n' + RDS + "}\nrd()\n")
add("SF_notwin", "type Circle = { r: i32 }\ntype Sq = { s: i32 }\ntype Shape = Circle | Sq\n"
    "type WS1 = { f: {[string]: Circle} }\n"
    'function rd() {\n  const lv1 = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: WS1 = { f: lv1 }\n' + RDS + "}\nrd()\n")
add("SF_nounion", "type Circle = { r: i32 }\ntype Dot = { r: i32 }\n"
    "type WS1 = { f: {[string]: Circle} }\n"
    'function rd() {\n  const lv1 = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: WS1 = { f: lv1 }\n' + RDS + "}\nrd()\n")
add("SF_bare", "type Circle = { r: i32 }\ntype WS1 = { f: {[string]: Circle} }\n"
    'function rd() {\n  const lv1 = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: WS1 = { f: lv1 }\n' + RDS + "}\nrd()\n")
add("SF_innerann", HEADO + "type WS1 = { f: {[string]: Circle} }\n"
    'function rd() {\n  const lv1: {[string]: Circle} = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: WS1 = { f: lv1 }\n' + RDS + "}\nrd()\n")

# ── family CLAIM : a second declaration of the SAME container layout, no twin, no union ──
RDLM = '''  const g0 = c
  if g0.length > 0 {
    const g1 = (g0[0])["k0"] ?? { r: 0 }
    if (g1).r == 7 { print(7) } else { print(0) }
  } else { print(0) }
'''
BODYLM = ('function rd() {\n  const lv1 = Map()\n  lv1["k0"] = { r: 7 }\n'
          '  const c: {[string]: Circle}[] = [lv1]\n' + RDLM + "}\nrd()\n")
add("CL_asfiled", "type Circle = { r: i32 }\ntype Box1 = {[string]: Circle}[]\n"
    "const _sp1: Box1 = []\n" + BODYLM)
add("CL_noalias", "type Circle = { r: i32 }\n" + BODYLM)
add("CL_aliasnospare", "type Circle = { r: i32 }\ntype Box1 = {[string]: Circle}[]\n" + BODYLM)
add("CL_spareonly", "type Circle = { r: i32 }\nconst _sp1: {[string]: Circle}[] = []\n" + BODYLM)
add("CL_innerann", "type Circle = { r: i32 }\ntype Box1 = {[string]: Circle}[]\n"
    "const _sp1: Box1 = []\n"
    'function rd() {\n  const lv1: {[string]: Circle} = Map()\n  lv1["k0"] = { r: 7 }\n'
    '  const c: {[string]: Circle}[] = [lv1]\n' + RDLM + "}\nrd()\n")

for k, v in F.items():
    open(os.path.join(OUT, k + ".vl"), "w").write(v)
json.dump({"expect": E, "coords": {k: {} for k in E}},
          open(os.path.join(OUT, "manifest.json"), "w"))
print("min cells:", len(F))
