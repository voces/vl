"""Grid T — the DE-CONFOUNDING grid for D224's cut.

Block B crosses `twin` only at its three CORNERS, so `twin=armtwin` there always carries
`claim=2` and `union=used`: the 65 cells the arm-rung lift costs cannot be separated from
their container-alias count inside block B at all. This grid takes the exact coordinate of
every one of those 65 and of D211's 4 armtwin wins, and crosses `twin` x `claim` x `union`
fully against each, holding the other nine axes at that cell's own values.
"""
import itertools, json, os, sys
sys.path.insert(0, "scripts/silent-sweep/census")
import gencensus as G

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
cost = json.load(open("scripts/silent-sweep/census/d224-cost.json"))["cells"]
manA = json.load(open(sys.argv[2] + "/manifest.json"))
seeds = []
for k, v in cost.items():
    if v["coord"]["twin"] == "armtwin":
        seeds.append(("cost", dict(v["coord"])))
WIN = ['a099944', 'a101456', 'a110312', 'a111824']
for n in WIN:
    seeds.append(("win", dict(manA["coords"][n])))
print("seed coords:", len(seeds))

cells, tags = [], []
for tag, base in seeds:
    for twin, claim, union in itertools.product(
            ["none", "exact", "samearity", "armtwin"], ["0", "1", "2"],
            ["nounion", "unused", "used"]):
        c = dict(base); c.update(twin=twin, claim=claim, union=union)
        cells.append(c); tags.append(tag)

expect, coords, skips, meta = {}, {}, {}, {}
n = 0
for c, tag in zip(cells, tags):
    why = G.skip_reason(c)
    if why:
        skips[why] = skips.get(why, 0) + 1
        continue
    name = "t%06d" % n
    text, exp = G.emit(c)
    open(os.path.join(OUT, name + ".vl"), "w").write(text)
    expect[name] = exp; coords[name] = c; meta[name] = tag
    n += 1
json.dump({"expect": expect, "coords": coords, "skips": skips, "block": "T",
           "generated": n, "tag": meta}, open(os.path.join(OUT, "manifest.json"), "w"))
print("grid T: considered=%d generated=%d skipped=%d" % (len(cells), n, len(cells) - n))
for k in sorted(skips, key=lambda k: -skips[k]): print("  skip %6d %s" % (skips[k], k))
