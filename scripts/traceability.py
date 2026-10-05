from pathlib import Path
import json
s=json.loads(Path('docs/specifications.json').read_text());cases={u['id']:u for u in s['specs']}
diagrams={'UC01':'account / auth activity','UC02':'levels / navigation','UC03':'future settings flow','UC04':'levels / navigation / classes','UC05':'creation / AI activity','UC06':'creation','UC07':'community / database','UC08':'community / database','UC09':'future database','UC10':'future database / architecture','UC11':'future publishing','UC12':'AI activity','UC13':'AI activity','UC14':'navigation / classes','UC15':'future item flow'}
rows=[]
for fid,name,desc,ucs,status in s['features']:
 reqs=sorted({cases[u]['requirement']for u in ucs if u in cases});tables=sorted({t for u in ucs if u in cases for t in cases[u]['tables']});dg=sorted({diagrams[u]for u in ucs})
 evidence='Planned acceptance' if status=='Planned' else 'Source + local tests; live evidence where stated'
 rows.append([fid,', '.join(ucs),', '.join(reqs)or'Future specification', '; '.join(dg),'; '.join(tables)or'Future design',status,evidence])
Path('docs/traceability.json').write_text(json.dumps(rows,indent=2))
p=['# Feature traceability','','F01–F15 retain all original categories. R01–R10 match the ten complete use cases; other use cases have planned summaries. Status distinguishes built behavior from future acceptance.','','| Feature | Use cases | Requirements | Diagrams | Data | Status | Evidence |','|---|---|---|---|---|---|---|']
p+=['| '+' | '.join(row)+' |'for row in rows];Path('docs/TRACEABILITY.md').write_text('\n'.join(p)+'\n')
