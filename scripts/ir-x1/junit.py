import sys,re,collections,xml.etree.ElementTree as ET
t=ET.parse(sys.argv[1]); c=collections.Counter(); ex=collections.defaultdict(list); files=collections.Counter()
for tc in t.iter('testcase'):
  f=tc.find('failure')
  if f is None: continue
  msg=(f.get('message') or '')+(f.text or '')
  if 'IR-only miss' in msg: k='b-irmiss'
  elif re.search(r'wasm trap|unreachable|RuntimeError',msg): k='d-trap'
  elif re.search(r'CompileError|invalid|validat',msg,re.I): k='d-invalid'
  else: k='other'
  c[k]+=1; files[(tc.get('classname') or '').split('/')[-1]+' '+k]+=1
  ex[k].append((tc.get('classname'),tc.get('name'),msg[:400]))
print(c)
for k,n in files.most_common(25): print(n,k)
for k in ex:
  if k!='b-irmiss':
    for e in ex[k][:int(sys.argv[2]) if len(sys.argv)>2 else 6]: print('---',k,e[0],e[1][:150]); print(e[2][:400])
