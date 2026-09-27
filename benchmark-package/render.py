"""All-recipe panels built from the existing chart generator's SVG primitives."""
import csv, hashlib, json, math, shutil, statistics, sys
from pathlib import Path
from html import escape
HERE=Path(__file__).resolve().parent
LAB=HERE.parents[1]
PORTABLE=(HERE/'bench/results').is_dir()
SOURCE=HERE/'bench/results' if PORTABLE else LAB/'outputs/2026-09-26-tool-eval-readme-chart/bench/results'
OUT=HERE if PORTABLE else HERE/'package'
RES=OUT/'bench/results'
sys.path.insert(0,str(SOURCE))
if not PORTABLE:sys.path.insert(0,str(SOURCE.parents[1]))
import chart
import tool_eval_chart
from export_evidence import redact
NAMES={'ringside':'RiNGSiDE','miaai':'Mia','tonyd2wild':'Tony2wild','knapcio':'Knapcio'}
COLORS={'light':['#2163b5','#7446af','#b44e13','#168477'],'dark':['#69a9f8','#c19aef','#ffb06e','#66d5bb']}
W=1000

def svg_start(theme,title):
 s=chart.Svg(theme);s.t=dict(s.t)
 for k,color in zip(NAMES,COLORS[theme]):s.t[k]=color
 s.text(28,39,title,24,weight=700)
 return s

def finish(s,height,title):
 return f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="{height}" viewBox="0 0 1000 {height}" role="img" aria-label="{escape(title)}" style="font-family:{chart.FONT}"><rect width="1000" height="{height}" fill="{s.t["surface"]}"/>'+''.join(s.parts)+'</svg>\n'

def legend(s,y):
 for i,(key,name) in enumerate(NAMES.items()):s.swatch(28+230*i,y-10,key);s.text(47+230*i,y,name,13)

def quality(data,theme,history=False):
 s=svg_start(theme,'Tool-eval · quality versus elapsed time')
 s.text(28,64,'92 cases · temperature 0 · thinking enabled · separate effort, cap, concurrency and TP cohorts',12,fill='ink2')
 legend(s,92)
 s.text(28,116,'Dots: every run. Diamonds: repeated-cohort medians. Crosses: observed ranges, not confidence intervals.',11,fill='ink2')
 s.text(28,135,'★ Reported output-cap truncation. Singles have no variance estimate. Faster ←  |  Higher score ↑',11,fill='ink2')
 y=169
 for tp in (4,2):
  s.text(28,y,f'TP{tp} · {4 if tp==4 else 2} DGX Sparks',19,weight=700);y+=23
  if tp==2:s.text(28,y,'Tony2wild: three High/C4 rounds and one Max/C4 result; owner stopped. Knapcio: no TP2 run.',11,fill='ink2');y+=23
  combos=sorted({(r['mode'],r['parallel']) for r in data['rounds'] if r['tp']==tp},key=lambda x:({'high':0,'low':1,'max':2}[x[0]],x[1]))
  for j,(mode,c) in enumerate(combos):
   x=28+(j%2)*486;py=y+(j//2)*320
   rows=[r for r in data['rounds'] if (r['tp'],r['mode'],r['parallel'])==(tp,mode,c)]
   s.text(x,py,f'{mode.title()} · {32 if mode=="max" else 16}K · C{c}',15,weight=600)
   left=x+40;right=x+420;top=py+28;bottom=py+228
   end=math.ceil(max(r['seconds'] for r in rows)/300)*5
   def px(sec):return left+sec/60/end*(right-left)
   def sy(score):return bottom-(score-80)/20*(bottom-top)
   for score in (80,85,90,95,100):s.line(left,sy(score),right,sy(score));s.text(left-8,sy(score)+4,str(score),10,anchor='end',fill='ink2')
   for tick in range(5):
    val=end*tick/4;xx=left+(right-left)*tick/4;s.text(xx,bottom+17,f'{val:g}',10,anchor='middle',fill='ink2')
   s.text((left+right)/2,bottom+34,'elapsed minutes · lower is faster',10,anchor='middle',fill='ink2')
   for key in NAMES:
    group=[r for r in rows if r['recipe']==key]
    for r in group:
     tip=f'{NAMES[key]} {r["score"]}/100 in {r["seconds"]:.3f}s; run {r["round"]}; truncation {r["reported_truncation_cases"]}'
     s.parts.append(f'<a href="bench/results/{escape(r["receipt"]["folder"])}/result.json">')
     s.dot(px(r['seconds']),sy(r['score']),key,tip)
     if r['reported_truncation_cases']:s.text(px(r['seconds'])+5,sy(r['score'])-6,'★',10,fill=key)
     s.parts.append('</a>')
    if len(group)>1:
     secs=[r['seconds'] for r in group];scores=[r['score'] for r in group];xx=px(statistics.median(secs));yy=sy(statistics.median(scores))
     s.line(px(min(secs)),yy,px(max(secs)),yy,key,1.5);s.line(xx,sy(min(scores)),xx,sy(max(scores)),key,1.5)
     s.path(f'M{xx} {yy-6}L{xx+6} {yy}L{xx} {yy+6}L{xx-6} {yy}Z',key,f'{NAMES[key]} median; n={len(group)}')
   counts=' · '.join(f'{NAMES[k]} n={sum(r["recipe"]==k for r in rows)}' for k in NAMES if any(r['recipe']==k for r in rows))
   s.text(x+40,py+289,counts,10,fill='ink2')
  y+=math.ceil(len(combos)/2)*320+16
 if history:
  h=json.loads((SOURCE/'evidence/tool-eval-historical.json').read_text())
  s.text(28,y,'Historical context · different 69-case benchmark',19,weight=700);y+=26
  s.text(28,y,'Excluded from all current axes and statistics. Default Max effort; elapsed time unavailable.',12,fill='ink2');y+=25
  s.text(28,y,'RiNGSiDE TP4 release scores: '+', '.join(str(r['score']) for r in h['rounds'])+' / 100.',13);y+=30
 s.text(28,y,'Recipe-level observations. Different checkpoints, runtimes and templates; no isolated precision-quality claim.',11,fill='ink2')
 return finish(s,y+28,'Tool-eval quality and time')

def speed(data,theme):
 s=svg_start(theme,'Inference speed · RigMark and SparkBench')
 s.text(28,65,'Historical measured recipe configurations · exact source windows and settings in the evidence tables',12,fill='ink2');legend(s,92)
 s.text(28,117,'Knapcio: one pass, switchless port. Native template ignores thinking-off; effective equivalence is unproved.',11,fill='ink2')
 y=151
 specs=[('RigMark decode','decode',['code','prose','structured'],'tok/s ↑'),('Cold prefill TTFT','cold_s',None,'seconds ↓'),('Warm replay TTFT','replay_s',None,'seconds ↓'),('Code concurrent throughput','agg',None,'aggregate tok/s ↑'),('Prose concurrent throughput','prose_agg',None,'aggregate tok/s ↑'),('Staggered: prefill first','staggered0',None,'newcomer TTFT seconds ↓'),('Staggered: decode first','staggered1',None,'newcomer TTFT seconds ↓')]+[(f'SparkBench · {k}','spark_'+k,['1','2','3','4'],'mean stream tok/s ↑') for k in ('prose','structured','code','json')]
 for tp in (4,2):
  ss=[r for r in data['rows'] if r['tp_size']==tp]
  s.text(28,y,f'TP{tp} · '+('four recipes' if tp==4 else 'three recipes; Knapcio unmeasured'),20,weight=700);y+=32
  for j,(title,key,axis,unit) in enumerate(specs):
   x=28+(j%2)*486;py=y+(j//2)*273;values={}
   for r in ss:
    if key in ('cold_s','replay_s'):v={k:d[key] for k,d in r.get('prefill_suite',{}).items() if d.get(key) is not None}
    elif key.startswith('staggered'):v={k:d[int(key[-1])] for k,d in r.get('staggered',{}).items()}
    elif key.startswith('spark_'):v={k.split('x')[-1]:v for k,v in r.get('sparkdash',{}).items() if k.startswith(key[6:]+'x')}
    else:v=r.get(key,{})
    values[r['recipe_key']]={str(k):v for k,v in v.items() if isinstance(v,(float,int)) and math.isfinite(v)}
   xs=axis or sorted(set().union(*(v.keys() for v in values.values())),key=int)
   nums=[v for d in values.values() for v in d.values()]
   s.text(x,py,title,15,weight=600);s.text(x,py+20,unit,10,fill='ink2')
   if not nums:s.text(x,py+60,'Not measured',12);continue
   upper,step=chart.scale_max(max(nums),4);left=x+46;right=x+425;bottom=py+205;top=py+38
   def px(i):return left+i/max(1,len(xs)-1)*(right-left)
   def sy(val):return bottom-val/upper*(bottom-top)
   for tick in range(5):
    val=upper*tick/4;yy=sy(val);s.line(left,yy,right,yy);s.text(left-8,yy+3,f'{val:.1f}' if upper<10 else f'{val:g}',9,anchor='end',fill='ink2')
   for i,label in enumerate(xs):s.text(px(i),bottom+18,(f'{int(label)//1024}K' if key in ('cold_s','replay_s') else label),10,anchor='middle',fill='ink2')
   for recipe,vs in values.items():
    segment=[]
    for i,label in enumerate(xs):
     if label not in vs:
      if len(segment)>1:s.polyline(segment,recipe)
      segment=[];continue
     point=(px(i),sy(vs[label]));segment.append(point);s.dot(*point,recipe,f'{NAMES[recipe]} {label}: {vs[label]:g} {unit}')
    if len(segment)>1:s.polyline(segment,recipe)
   s.text(x+46,py+245,'Workload' if key=='decode' else ('Input tokens' if key in ('cold_s','replay_s') else 'Concurrent requests'),10,fill='ink2')
  y+=math.ceil(len(specs)/2)*273+28
 s.text(28,y,'RigMark aggregate end-to-end rate and SparkBench per-stream decode rate are separate metrics.',11,fill='ink2')
 return finish(s,y+28,'RigMark and SparkBench speed')

def main():
 d=json.loads((RES/'evidence/tool-eval-current.json').read_text());sp=json.loads((HERE/('speed-evidence.json' if PORTABLE else 'speed.json')).read_text())
 # Copy generator primitives with the package so the rendering itself remains reproducible.
 if not PORTABLE:
  shutil.copy2(HERE/'render.py',OUT/'render.py')
  for name in ('chart.py','tool_eval_chart.py','export_evidence.py'):
   shutil.copy2((SOURCE.parents[1] if name=='export_evidence.py' else SOURCE)/name,RES/name)
  shutil.copy2(SOURCE/'evidence/tool-eval-historical.json',RES/'evidence/tool-eval-historical.json')
 baseline=OUT/'canonical-baseline/bench/results'
 if not PORTABLE:
  (baseline/'evidence').mkdir(parents=True,exist_ok=True)
  shutil.copy2(SOURCE/'evidence/tool-eval-current.json',baseline/'evidence/tool-eval-current.json')
  for theme in ('light','dark'):
   shutil.copy2(SOURCE/f'chart-{theme}.svg',RES/f'baseline-speed-{theme}.svg')
 for theme in ('light','dark'):
  (RES/f'baseline-tool-eval-{theme}.svg').write_text(tool_eval_chart.render_svg(theme,root=baseline.parents[1]))
 for theme in ('light','dark'):
  for hist in (False,True):(OUT/f'tool-eval-{theme}{"-history" if hist else ""}.svg').write_text(quality(d,theme,hist))
  (OUT/f'speed-{theme}.svg').write_text(speed(sp,theme))
 records=[]
 for r in d['rounds']:records.append({k:r.get(k) for k in ('recipe','tp','mode','parallel','round','score','seconds','run_id','reported_truncation_cases')})
 with (OUT/'tool-eval-rounds.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
 cells=[]
 for r in sp['rows']:
  for key in ('decode','agg','prose_agg','sparkdash'):
   for cell,value in r.get(key,{}).items():cells.append(dict(recipe=r['recipe_key'],tp=r['tp_size'],metric=key,cell=cell,value=value,window=r['lab_receipt'],rounds=r.get('sparkdash_rounds',1) if key=='sparkdash' else r.get('runs',1)))
  for depth,v in r.get('prefill_suite',{}).items():
   for k in ('cold_s','replay_s'):cells.append(dict(recipe=r['recipe_key'],tp=r['tp_size'],metric=k,cell=depth,value=v.get(k),window=r['lab_receipt'],rounds=r.get('runs',1)))
  for c,v in r.get('staggered',{}).items():
   for idx,k in enumerate(('prefill_first_ttft_s','decode_first_ttft_s')):cells.append(dict(recipe=r['recipe_key'],tp=r['tp_size'],metric=k,cell=c,value=v[idx],window=r['lab_receipt'],rounds=r.get('staggered_rounds',1)))
 with (OUT/'speed-cells.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(cells[0]));w.writeheader();w.writerows(cells)
 rows=''.join('<tr>'+''.join(f'<td>{escape(str(v))}</td>' for v in [NAMES[r['recipe']],r['tp'],r['mode'],r['parallel'],r['round'],r['score'],f'{r["seconds"]:.3f}',', '.join(x if isinstance(x,str) else json.dumps(x,sort_keys=True) for x in r['reported_truncation_cases']) or 'none reported'])+f'<td><a href="bench/results/{r["receipt"]["folder"]}/result.json">receipt</a></td></tr>' for r in d['rounds'])
 protocols=''.join(f'<li><b>{NAMES[r["recipe_key"]]} TP{r["tp_size"]}</b>: {escape(r["lab_receipt"])}; RigMark n={r.get("runs",1)}, SparkBench n={r.get("sparkdash_rounds",1)}. {escape(r.get("configuration",r.get("recipe","")))}</li>' for r in sp['rows'])
 def summary_cell(recipe,tp,mode,parallel=4):
  rr=[r for r in d['rounds'] if (r['recipe'],r['tp'],r['mode'],r['parallel'])==(recipe,tp,mode,parallel)]
  if not rr:return '—'
  score=statistics.median(r['score'] for r in rr); sec=statistics.median(r['seconds'] for r in rr)
  label=f'{score:g}/100 · {sec/60:.1f} min' + (f' · n={len(rr)}' if len(rr)>1 else ' · single')
  return f'<a href="bench/results/{escape(rr[0]["receipt"]["folder"])}/result.json">{label}</a>'
 spotlight=''.join(f'<tr><th>TP{tp}</th><td>{summary_cell("ringside",tp,"high")}</td><td>{summary_cell("ringside",tp,"low")}</td><td>{summary_cell("ringside",tp,"max")}</td></tr>' for tp in (4,2))
 matrix=''.join('<tr><th>'+('RiNGSiDE' if recipe=='ringside' else NAMES[recipe])+f' TP{tp}</th>'+''.join(f'<td>{summary_cell(recipe,tp,mode)}</td>' for mode in ('high','low','max'))+'</tr>' for tp in (4,2) for recipe in NAMES if any(r['recipe']==recipe and r['tp']==tp for r in d['rounds']))
 provenance=[('RiNGSiDE','TP4','lab plan 92817b8d','lab plan 89dfef84','RedHatAI 18d55bfd (quality); speed checkpoint in source receipt'),('RiNGSiDE','TP2','lab plan b80911ec','lab plan 69ad74fc','RedHatAI 18d55bfd (quality); NVIDIA (speed)'),('Mia','TP4','recipe 70b2f332767d303c7b13e60af1b0530adad349c2','recipe 7cded8e2ed9d7502f32591cfeeeea4747db3d393','brandonmusic 5ab363a8 (quality)'),('Mia','TP2','recipe 70b2f332767d303c7b13e60af1b0530adad349c2','recipe 7cded8e2ed9d7502f32591cfeeeea4747db3d393','brandonmusic 5ab363a8 (quality)'),('Tony2wild','TP4','recipe 2ac4e8dd661b12e6a1d7e69df711707abd6b9cd4','recipe 2ac4e8dd661b12e6a1d7e69df711707abd6b9cd4','see run receipts'),('Tony2wild','TP2','recipe abb38bb0c4225855919d55309cd3e506d7941468','recipe 9fea48c13b0de4a427fd443718ddd3e39863a013','one Max/C4; owner-stopped partial campaign'),('Knapcio','TP4','recipe dddb034717cb84c362d8a370b81723fa4ee0c4d2','recipe dddb034717cb84c362d8a370b81723fa4ee0c4d2','NVIDIA target; measured switchless port')]
 provenance_rows=''.join('<tr>'+''.join(f'<td>{escape(x)}</td>' for x in row)+'</tr>' for row in provenance)
 (OUT/'source-identities.json').write_text(json.dumps({'tool_eval_commit':d['benchmark']['commit'],'rows':[dict(recipe=r[0],tp=r[1],tool_eval_source=r[2],speed_source=r[3],checkpoint_note=r[4]) for r in provenance]},indent=2)+'\n')
 html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recipe comparison · review draft</title><link rel="stylesheet" href="style.css"><body><main><header><p>LOCAL REVIEW · NOT PUBLISHED</p><h1>GLM-5.3 Flash recipe comparison</h1><nav><a href="#quality">Quality × time</a><a href="#speed">Inference speed</a><a href="#evidence">Evidence</a></nav></header><p>Four recipes, separate TP4 and TP2 panels. No new benchmark runs. Missing measurements are not zeros.</p><section id="quality"><h2>1. Tool-eval quality versus time</h2><p>Every completed temperature-zero 92-case round is shown. Medians and observed ranges appear only for repeated cohorts. Singletons do not estimate variability. Time excludes boot, queue and preparation. Reported truncations remain visible; their absence does not prove no cap exhaustion.</p><picture><source media="(prefers-color-scheme:dark)" srcset="tool-eval-dark.svg"><img src="tool-eval-light.svg" alt="Quality versus time in separate effort, cap, concurrency and TP panels"></picture><p><a href="tool-eval-rounds.csv">All 60 rounds (CSV)</a> · <a href="tool-eval-light-history.svg">Separate historical appendix</a> · <a href="tool-eval-dark-history.svg">Dark history version</a></p><details><summary>Scores, elapsed time and per-round receipts</summary><div class="table"><table><thead><tr><th>Recipe</th><th>TP</th><th>Effort</th><th>C</th><th>Run</th><th>Score</th><th>Seconds</th><th>Truncation</th><th>Source</th></tr></thead><tbody>'''+rows+'''</tbody></table></div></details></section><section id="speed"><h2>2. RigMark and SparkBench speed</h2><p><strong>These are complete-recipe observations, not isolated quantization or kernel comparisons.</strong> Checkpoints, versions, speculative decoding and templates differ. Knapcio uses the owner-approved switchless port; its native template ignores thinking-off, so equivalent effective thinking behavior is unproved. Knapcio has one pass; historical recipes retain their recorded sample counts.</p><picture><source media="(prefers-color-scheme:dark)" srcset="speed-dark.svg"><img src="speed-light.svg" alt="RigMark decode, cold and warm TTFT, concurrent throughput, both staggered directions, and SparkBench per-stream decode"></picture><p><a href="speed-cells.csv">All speed cells (CSV)</a> · <a href="speed-evidence.json">Settings and source hashes</a></p></section><section id="evidence"><h2>Evidence and publication notes</h2><ul>'''+protocols+'''</ul><p>Current tool-eval uses bd35ba91, 69 core + 23 Hard Mode cases, T0, seed 42, top_p 1, top_k -1, min_p 0, repetition 1, eight turns and 300-second timeout. High/Low use 16K; Max uses 32K. Temperature-one observations and earlier 69-case scores are not pooled.</p><p>Tony TP4 retains 13 greedy results and an owner-stopped parent after sampled rounds were skipped. Tony TP2 retains three High/C4 and one Max/C4 result; its parent was owner-stopped after the first Max, with ten planned rounds unrun. Both clean releases were verified. Knapcio's parent remains cancelled/failed after the owner removed the second recipe boot; completed clients and exact cleanup were independently verified.</p><p>Tool-eval RiNGSiDE uses the RedHat checkpoint at both TP sizes. The historical TP2 speed reference uses NVIDIA weights; do not treat it as the same configuration as the TP2 quality panel. Recipe configurations and date differences remain attached to each result.</p><p>Credit: SeraphimSerapis/tool-eval-bench; alexellis/rigmark; MiaAI-Lab/sparkDash; recipe authors othexmr, MiaAI-Lab, tonyd2wild and knapcio. This package is prepared for owner review only. Nothing here authorizes public publication.</p></section></main></body></html>'''
 html=html.replace('<nav><a href="#quality">','<nav><a href="#baseline">RiNGSiDE baseline</a><a href="#quality">')
 html=html.replace('<section id="quality">','<section id="baseline"><h2>1. Our measured RiNGSiDE baseline</h2><p>The original chart generator from yesterday renders these same RiNGSiDE TP4 and TP2 receipts, including every round, medians and ranges. Blue is TP4; orange is TP2. Nothing here is a new run.</p><div class="table"><table><thead><tr><th>Ours</th><th>High · C4</th><th>Low · C4</th><th>Max · C4</th></tr></thead><tbody>'+spotlight+'</tbody></table></div><picture><source media="(prefers-color-scheme:dark)" srcset="bench/results/baseline-tool-eval-dark.svg"><img src="bench/results/baseline-tool-eval-light.svg" alt="Original RiNGSiDE tool-eval generator chart: TP4 and TP2 score versus round time, every round and median"></picture><p><a href="canonical-baseline/bench/results/evidence/tool-eval-current.json">Original 37-round evidence</a> · <a href="bench/results/tool_eval_chart.py">Original tool chart generator</a></p></section><section id="quality">',1)
 html=html.replace('<h2>1. Tool-eval quality versus time</h2>','<h2>2. Four-recipe tool-eval comparison</h2><p>Our rounds are shown alongside every available Mia, Tony2wild and Knapcio TP4/TP2 round. The table keeps comparable C4 cohorts visible; separate C8/C16 cohorts remain in the chart and CSV.</p><div class="table"><table><thead><tr><th>Recipe</th><th>High · C4</th><th>Low · C4</th><th>Max · C4</th></tr></thead><tbody>'+matrix+'</tbody></table></div>')
 html=html.replace('<h2>2. RigMark and SparkBench speed</h2>','<h2>3. RigMark and SparkBench speed</h2>')
 html=html.replace('<a href="canonical-baseline/bench/results/evidence/tool-eval-current.json">Original 37-round evidence</a>', '<a href="bench/results/baseline-tool-eval-light.svg">Open original chart full size</a> · <a href="canonical-baseline/bench/results/evidence/tool-eval-current.json">Original 37-round evidence</a>')
 html=html.replace('<a href="tool-eval-rounds.csv">All 60 rounds (CSV)</a>', '<a href="tool-eval-light.svg">Open comparison chart full size</a> · <a href="tool-eval-rounds.csv">All 60 rounds (CSV)</a>')
 html=html.replace('<a href="speed-cells.csv">All speed cells (CSV)</a>', '<a href="speed-light.svg">Open comparison speed chart full size</a> · <a href="speed-cells.csv">All speed cells (CSV)</a>')
 html=html.replace('<section id="evidence">','<section id="source-pins"><h2>Exact source identities used</h2><p>Recipe commits and lab plan hashes are different identity types. Quality and speed windows sometimes used different recipe commits, plans or checkpoints; the rows below preserve that distinction. The tool-eval suite itself is <strong>bd35ba91b3276a6cfb04c6d7b4acfd481168bf89</strong>.</p><div class="table"><table><thead><tr><th>Recipe</th><th>TP</th><th>Tool-eval source</th><th>Speed source</th><th>Checkpoint note</th></tr></thead><tbody>'+provenance_rows+'</tbody></table></div><p><a href="source-identities.json">Download exact identity table (JSON)</a>. For complete per-window source, image and settings evidence, use <a href="bench/results/evidence/tool-eval-current.json">tool-eval evidence</a> and <a href="speed-evidence.json">speed evidence</a>. A lab plan hash is not a Git commit.</p></section><section id="evidence">',1)
 html=html.replace('<p><a href="speed-cells.csv">All speed cells (CSV)</a>','<h3>RiNGSiDE speed in the original chart generator</h3><p>Our TP4 and TP2 RigMark and SparkBench rows, rendered in the established blue/orange layout:</p><picture><source media="(prefers-color-scheme:dark)" srcset="bench/results/baseline-speed-dark.svg"><img src="bench/results/baseline-speed-light.svg" alt="Original RiNGSiDE speed chart for TP4 and TP2"></picture><p><a href="speed-cells.csv">All speed cells (CSV)</a>')
 sampled_path=OUT/'sampled-appendix.json'
 if sampled_path.exists():
  appendix=json.loads(sampled_path.read_text())
  items=''.join(f'<li>{escape(r["recipe"])} TP{r["tp"]} {r["effort"]} C{r["concurrency"]}: {r["score"]}/100 in {r["seconds"]:g}s — {escape(r["status"])}. <a href="{r["receipt"]}">Receipt</a></li>' for r in appendix)
  html=html.replace('<section id="evidence">','<section id="sampled"><h2>Separate sampled appendix</h2><p>T1, top_p 0.95, seed 42. Single observations; excluded from the temperature-zero charts and medians.</p><ul>'+items+'</ul></section><section id="evidence">')
 (OUT/'index.html').write_text(html)
 (OUT/'style.css').write_text('''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fcfcfb;color:#151515;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1060px;margin:auto;padding:30px}header{border-bottom:2px solid #e1e0d9;padding-bottom:25px}header>p{letter-spacing:.15em;font-size:12px;color:#666;font-weight:700}h1{font-size:38px;line-height:1.15;letter-spacing:-.035em}h2{margin-top:60px;font-size:27px;letter-spacing:-.025em}h3{font-size:19px}nav{display:flex;gap:24px;flex-wrap:wrap}nav a{font-weight:600}a{color:#2163b5}p,li,td{overflow-wrap:anywhere}picture,img{display:block;width:100%;height:auto}picture{margin:22px 0;border:1px solid #e1e0d9;border-radius:10px;overflow:hidden}section{scroll-margin-top:20px}.table{overflow-x:auto;max-width:100%;margin:18px 0 25px;border:1px solid #e1e0d9;border-radius:9px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px 11px;text-align:left;border-bottom:1px solid #e1e0d9;vertical-align:top}thead{background:#eef3f9}tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}th{font-weight:700}li{margin:14px 0}details{margin:20px 0}@media(max-width:600px){main{padding:15px}h1{font-size:28px}h2{font-size:22px}td,th{padding:7px}}@media(prefers-color-scheme:dark){body{background:#1a1a19;color:#eee}header,picture,.table,td,th{border-color:#383835}thead{background:#262b33}a{color:#8fc1ff}header>p{color:#aaa}}''')
 (OUT/'speed-evidence.json').write_text(redact(json.dumps(sp,indent=2))+'\n')
 print('Rendered 4 quality variants, 2 speed variants and offline comparison page')
if __name__=='__main__':main()
