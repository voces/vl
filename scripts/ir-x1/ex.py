import re,collections,os,sys
ex=collections.defaultdict(list)
for r in open(sys.argv[1]):
  m=re.match(r"\[ir\] (\S*?\.vl): (\d+)\tfmiss (.*?) \| (.*)$",r.rstrip('\n'))
  if not m or not os.path.exists(m.group(1)): continue
  f,_,fn,why=m.groups()
  w=re.sub(r"^(start: )?build: ",lambda mm: mm.group(1) or "",why)
  ex[w].append((os.path.getsize(f),f,fn))
for k in sys.argv[2:]:
  l=sorted(set(ex[k]))
  user=[x for x in l if '$m' not in x[2]][:3]
  stdl=collections.Counter(x[2] for x in l if '$m' in x[2]).most_common(3)
  print("==",k,len(l),"user:",[(x[1].replace('tests/cases/',''),x[2]) for x in user],"std:",stdl)
