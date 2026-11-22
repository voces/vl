import sys,re,collections
rows=open(sys.argv[1]).read().splitlines()
prog=collections.defaultdict(set); fnmiss={}
def norm(w):
    w=re.sub(r"^(start: )?(build: )?","",w)
    w=re.sub(r"^read of [A-Za-z0-9_$]+$","read of <name>",w)
    return w
for r in rows:
    m=re.match(r"\[ir\] (.*): (\d+)\tfmiss (.*?) \| (.*)$",r)
    if not m: continue
    f,_,fn,why=m.groups()
    cls=("start: " if fn.startswith("@") else "")+norm(why)
    prog[f].add(cls)
    key=fn if "$m" in fn else f+"::"+fn
    fnmiss[key]=norm(why)
print("programs with misses",len(prog),"distinct missing fns",len(fnmiss))
single=collections.Counter(next(iter(s)) for s in prog.values() if len(s)==1)
print("programs blocked by exactly one class:",sum(single.values()))
byfn=collections.Counter(fnmiss.values())
inprog=collections.Counter(c for s in prog.values() for c in s)
print("%6s %6s %6s  class"%("fns","progs","only"))
for c,n in byfn.most_common(int(sys.argv[2]) if len(sys.argv)>2 else 40):
    print("%6d %6d %6d  %s"%(n,inprog[c],single[c],c))
# greedy unlock
rem={f:set(s) for f,s in prog.items()}; fixed=[];unl=0
for i in range(30):
    cnt=collections.Counter(c for s in rem.values() for c in s)
    # pick class whose fixing unlocks most programs now, weighted by unlock then frequency
    best=max(cnt,key=lambda c:(sum(1 for s in rem.values() if s=={c}),cnt[c]))
    for s in rem.values(): s.discard(best)
    done=[f for f,s in rem.items() if not s]; unl+=len(done)
    for f in done: del rem[f]
    fixed.append((best,unl))
print("greedy:",fixed)
nc=collections.Counter(len(s) for s in prog.values()); print("classes per program:",sorted(nc.items()))
