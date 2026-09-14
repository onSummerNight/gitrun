import {START,DAY,dateKey,asDate,addDays,monday,validateActivities,parseImport,inRange,totals,weeks,months,consecutiveWeeks,toCSV} from './data.mjs';
import {demoActivities} from './demo.mjs';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,decimals=0)=>value==null?'—':Number(value).toLocaleString('en-GB',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
const duration=value=>{if(value==null)return '—';const s=Math.round(value),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}m ${String(s%60).padStart(2,'0')}s`;};
const pace=value=>{if(value==null||!Number.isFinite(value))return '—';const s=Math.round(value);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
const date=(value,options={day:'numeric',month:'short',year:'numeric'})=>asDate(value).toLocaleDateString('en-GB',options);
const icon=name=>`<svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/>',mountain:'<path d="m2 20 7-13 4 7 3-5 6 11H2Z M7 11l2 2 2-2"/>',energy:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',pace:'<path d="M4 17a9 9 0 1 1 16 0M12 13l5-5M5 20h14"/><circle cx="12" cy="13" r="1.5"/>',run:'<circle cx="15" cy="4" r="2"/><path d="m9 7 4 1 3 4 4 1M13 8l-3 6 5 3-1 5M10 14l-4 5H2M9 7l-3 5"/>'}[name]||''}</svg>`;
const storeKey='gitrun.activities.v1';
let today=dateKey(),activities=[],published=[],publishedReady=false,publishedSource='Garmin export',mode='demo',range='all',type='all',query='',limit=8,updatedAt=null,heatYear=Number(today.slice(0,4)),toastTimer;
const current=()=>inRange(activities,range,today);
const all=()=>inRange(activities,'all',today);
const filtered=()=>current().filter(a=>(type==='all'||(type==='trail'?a.type==='trail':a.type!=='trail'))&&`${a.title} ${a.date} ${date(a.date)} ${a.type}`.toLowerCase().includes(query));
const typeName=type=>type==='trail'?'Trail run':type==='treadmill'?'Treadmill run':'Run';
function rangeStart(){return [START,range==='week'?addDays(today,-6):range==='month'?addDays(today,-29):range==='year'?`${today.slice(0,4)}-01-01`:START].sort().at(-1);}
function sparkline(items){
  if(!items.length)return '<svg class="sparkline" viewBox="0 0 320 60" role="img" aria-label="No distance recorded"><path d="M0 55H320" stroke="#708347" stroke-dasharray="3 5"/></svg>';
  const sorted=[...items].sort((a,b)=>a.date.localeCompare(b.date));let sum=0;const points=[[0,54]];const total=totals(items).distanceKm||1;
  sorted.forEach((a,i)=>{sum+=a.distanceKm;points.push([(i+1)/sorted.length*320,54-sum/total*48]);});const line=points.map(p=>p.join(',')).join(' ');
  return `<svg class="sparkline" viewBox="0 0 320 60" preserveAspectRatio="none" role="img" aria-label="Cumulative distance over ${items.length} runs"><defs><linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9fc58" stop-opacity=".17"/><stop offset="1" stop-color="#d9fc58" stop-opacity="0"/></linearGradient></defs><polygon points="0,60 ${line} 320,60" fill="url(#spark-fill)"/><polyline points="${line}" fill="none" stroke="#d9fc58" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function summary(){
  const items=current(),s=totals(items),days=Math.max(1,Math.round((asDate(today)-asDate(rangeStart()))/DAY)+1);
  $('#range-label').textContent=`${date(rangeStart(),{day:'numeric',month:'short',year:'numeric'})} — today`;
  const metric=(label,value,unit,note,symbol)=>`<article class="metric-card"><div class="metric-top"><h2 class="eyebrow">${label}</h2>${icon(symbol)}</div><p class="metric-value">${value}${unit?`<span class="unit">${unit}</span>`:''}</p><p class="metric-note">${note}</p></article>`;
  $('#summary').innerHTML=`<article class="distance-card"><h2 class="eyebrow">DISTANCE COVERED <span aria-hidden="true">↗</span></h2><div class="distance-value"><span class="distance-number">${fmt(s.distanceKm,1)}</span><span class="distance-unit">km</span></div><div class="distance-subline"><span class="pill">${s.count} runs</span><span>${s.activeDays} active days</span></div>${sparkline(items)}<div class="distance-bottom"><span>${fmt(s.distanceKm/(days/7),1)} km / week</span><span>${range==='all'?'SINCE JUL ’26':'IN THIS PERIOD'}</span></div></article>${metric('TIME ON YOUR FEET',duration(s.movingSeconds),'','Total moving time','clock')}${metric('ELEVATION GAIN',fmt(s.elevationM),'m',s.elevationCount===s.count&&s.count?'Every climb counts':`${s.elevationCount} of ${s.count} runs with elevation`,'mountain')}${metric('RECORDED ENERGY',fmt(s.calories),'kcal',s.calorieCount===s.count&&s.count?'Device-reported calories':`${s.calorieCount} of ${s.count} runs with calories`,'energy')}${metric('AVERAGE PACE',pace(s.pace),'/km','Total moving time ÷ distance','pace')}`;
}
function weekly(){
  const buckets=weeks(all(),today),max=Math.max(20,Math.ceil(Math.max(...buckets.map(w=>w.distanceKm))/10)*10);
  $('#weekly-chart').innerHTML=`<div class="volume-plot"><div class="y-axis" aria-hidden="true"><span>${max}</span><span>${max/2}</span><span>0</span></div><div class="bar-grid">${buckets.map((w,i)=>`<div class="bar-item"><button class="volume-bar ${i===11?'recent':''}" style="--height:${Math.max(w.distanceKm/max*100,1)}%" aria-label="Week of ${date(w.start)}: ${fmt(w.distanceKm,1)} kilometres in ${w.count} runs"><span class="bar-tooltip">${date(w.start,{day:'numeric',month:'short'})} · ${fmt(w.distanceKm,1)} km</span></button><span class="bar-label">${date(w.start,{day:'numeric',month:'short'})}</span></div>`).join('')}</div></div>`;
  const best=buckets.reduce((a,b)=>b.distanceKm>a.distanceKm?b:a,buckets[0]);
  $('#weekly-caption').innerHTML=`<span>Best week <strong>${fmt(best.distanceKm,1)} km</strong></span><span>This week <strong>${fmt(buckets.at(-1).distanceKm,1)} km</strong> · in progress</span>`;
}
function latest(){
  const a=all()[0];
  if(!a){$('#latest-run').innerHTML='<p class="eyebrow">MOST RECENT RUN</p><div class="empty-state">No runs recorded since July 2026.<br>Your next effort starts the story.</div>';return;}
  $('#latest-run').innerHTML=`<div class="latest-heading"><p class="eyebrow">MOST RECENT RUN</p><span class="activity-icon">${icon(a.type==='trail'?'mountain':'run')}</span></div><h2 class="latest-title">${esc(a.title)}</h2><p class="latest-date">${date(a.date,{weekday:'short',day:'numeric',month:'long',year:'numeric'})} <span aria-hidden="true">·</span> ${typeName(a.type)}</p><p class="latest-distance">${fmt(a.distanceKm,2)} <small>km</small></p><div class="latest-metrics"><div><strong>${duration(a.movingSeconds)}</strong><span>Moving time</span></div><div><strong>${pace(a.distanceKm?a.movingSeconds/a.distanceKm:null)} <small>/km</small></strong><span>Avg pace</span></div><div><strong>${fmt(a.averageHR)} <small>bpm</small></strong><span>Avg heart rate</span></div></div><button class="latest-link" data-run="${esc(a.id)}"><span>View this effort</span><span aria-hidden="true">↗</span></button>`;
}
function heatmap(){
  const byDate=new Map();all().forEach(a=>byDate.set(a.date,(byDate.get(a.date)||0)+a.distanceKm));
  const jan=`${heatYear}-01-01`,dec=`${heatYear}-12-31`,start=monday(jan),end=addDays(monday(dec),6),num=Math.round((asDate(end)-asDate(start))/DAY)+1;
  const cells=[],labels=[];let activeDays=0,totalKm=0;
  for(let i=0;i<num;i++){
    const d=addDays(start,i),valid=d>=jan&&d<=dec&&d>=START&&d<=today,n=valid?(byDate.get(d)||0):0;
    if(valid&&byDate.has(d)){activeDays++;totalKm+=n;}
    if(d.slice(-2)==='01'&&d>=jan&&d<=dec)labels.push(`<span style="left:${Math.floor(i/7)/Math.ceil(num/7)*100}%">${date(d,{month:'short'})}</span>`);
    const level=n>=15?4:n>=10?3:n>=5?2:n>0?1:0;
    cells.push(`<span class="heat-cell level-${level}" ${valid?'':'data-disabled'} title="${date(d)}: ${valid?(byDate.has(d)?fmt(n,2)+' km':'No run recorded'):'Outside tracking period'}" aria-hidden="true"></span>`);
  }
  $('#heatmap').innerHTML=`<div class="heatmap-layout"><div class="heatmap-weekdays" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div><div class="heatmap-main"><div class="heatmap-months" aria-hidden="true">${labels.join('')}</div><div class="heatmap-cells">${cells.join('')}</div></div></div>`;
  $('#consistency-caption').innerHTML=`<strong>${activeDays} active days</strong> in ${heatYear} <span aria-hidden="true">·</span> ${fmt(totalKm,1)} km <span aria-hidden="true">·</span> <strong>${consecutiveWeeks(all(),today)}-week</strong> current run streak`;
  $('#heatmap').setAttribute('role','img');$('#heatmap').setAttribute('aria-label',`Running calendar for ${heatYear}: ${activeDays} active days, ${fmt(totalKm,1)} kilometres. Individual dates and distances are available in the activity log.`);
  const startWeek=monday(today),w=all().filter(a=>a.date>=startWeek),s=totals(w);
  $('#week-caption').textContent=`${date(startWeek,{day:'numeric',month:'short'})} — ${date(addDays(startWeek,6),{day:'numeric',month:'short'})} · ${s.count} runs`;
  $('#week-strip').innerHTML=Array.from({length:7},(_,i)=>{const d=addDays(startWeek,i),runs=w.filter(a=>a.date===d),sum=totals(runs),future=d>today;return `<div class="week-day ${d===today?'today':''}" ${d===today?'aria-label="Today"':''}><div class="week-day-header"><span>${date(d,{weekday:'short'}).toUpperCase()}</span><span>${d.slice(-2)}${d===today?' •':''}</span></div>${runs.length?`<strong>${fmt(sum.distanceKm,1)}<small> km</small></strong><span>${duration(sum.movingSeconds)}</span>`:`<strong class="rest">—</strong><span>${future?'Upcoming':'No run'}</span>`}</div>`;}).join('');
}
function activityLog(){
  const items=filtered();$('#run-count').textContent=current().length;
  $('#activity-rows').innerHTML=items.length?items.slice(0,limit).map(a=>`<tr><td><div class="run-name"><span class="run-type-icon ${a.type}">${icon(a.type==='trail'?'mountain':'run')}</span><div><button class="run-name-text" data-run="${esc(a.id)}">${esc(a.title)}</button><small>${date(a.date,{day:'numeric',month:'short',year:'numeric'})} <span aria-hidden="true">·</span> ${typeName(a.type)}</small></div></div></td><td>${fmt(a.distanceKm,2)}<span class="unit">km</span></td><td>${duration(a.movingSeconds)}</td><td>${pace(a.distanceKm?a.movingSeconds/a.distanceKm:null)}<span class="unit">/km</span></td><td>${fmt(a.elevationM)}<span class="unit">m</span></td><td>${fmt(a.averageHR)}<span class="unit">bpm</span></td><td>${fmt(a.calories)}<span class="unit">kcal</span></td><td><button class="row-open" data-run="${esc(a.id)}" aria-label="View ${esc(a.title)} on ${date(a.date)}">↗</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty-state">No runs in this view. Try another period or clear your filters.</td></tr>';
  $('#table-caption').textContent=`Showing ${Math.min(items.length,limit)} of ${items.length} runs${query||type!=='all'?' · filtered':''}`;
  $('#load-more').hidden=items.length<=limit;
  $('#export-csv').disabled=!items.length;
}
function monthly(){
  const m=months(current());
  $('#monthly-stats').innerHTML=m.length?`<div class="month-cards">${m.map(s=>`<article class="month-card"><h3 class="month-title">${date(s.month+'-01',{month:'long',year:'numeric'}).toUpperCase()}</h3><p class="month-distance">${fmt(s.distanceKm,1)} <small>km</small></p><p class="month-details">${s.count} runs <span aria-hidden="true">·</span> ${duration(s.movingSeconds)}<br>${pace(s.pace)} /km <span aria-hidden="true">·</span> ${fmt(s.elevationM)} m gain<br>${fmt(s.calories)} kcal${s.calorieCount<s.count?' (partial)':''} <span aria-hidden="true">·</span> ${fmt(s.averageHR)} bpm</p></article>`).join('')}</div>`:'<p class="empty-state">Monthly totals will appear when runs are recorded in this period.</p>';
}
function render(){
  summary();weekly();latest();heatmap();activityLog();monthly();
  const synced=updatedAt?new Date(updatedAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'date unavailable';
  const automatic=publishedReady&&publishedSource==='Garmin Connect';
  const stale=automatic&&Date.now()-new Date(publishedUpdated).getTime()>24*60*60*1000;
  $('#data-state').textContent=mode==='demo'?'Sample data · This is a preview, not your running history.':`${mode==='local'?'Your browser import':automatic?'Garmin Connect':'Garmin activity export'} · Updated ${synced}${mode==='published'&&stale?' · Sync is overdue':''}`;
  $('#sync-connection').textContent=automatic?`Connected. Last synced ${new Date(publishedUpdated).toLocaleString('en-GB')}.${stale?' The latest update is overdue; check the GitHub sync job.':''}`:'One-time connection required. The preview currently uses sample data or an imported file.';
  $('#banner-action').hidden=mode!=='demo';
  $('#footer-source').textContent=mode==='demo'?'DEMO · ILLUSTRATIVE ACTIVITIES':`${mode==='published'&&automatic?'GARMIN CONNECT':'GARMIN EXPORT'} · ${all().length} RUNS SINCE JUL 2026`;
  $('#download-json').disabled=mode==='demo';$('#reset-data').hidden=mode!=='local';
}
function detail(id){
  const a=activities.find(a=>a.id===id);if(!a)return;
  const fields=[['Distance',fmt(a.distanceKm,2)+' km'],['Moving time',duration(a.movingSeconds)],['Average pace',pace(a.distanceKm?a.movingSeconds/a.distanceKm:null)+' /km'],['Elapsed time',duration(a.elapsedSeconds)],['Elevation gain',a.elevationM==null?'—':fmt(a.elevationM)+' m'],['Elevation loss',a.descentM==null?'—':fmt(a.descentM)+' m'],['Recorded energy',a.calories==null?'—':fmt(a.calories)+' kcal'],['Average heart rate',a.averageHR==null?'—':fmt(a.averageHR)+' bpm'],['Maximum heart rate',a.maxHR==null?'—':fmt(a.maxHR)+' bpm'],['Average cadence',a.cadence==null?'—':fmt(a.cadence)+' spm'],['Maximum cadence',a.maxCadence==null?null:fmt(a.maxCadence)+' spm'],['Steps',a.steps==null?null:fmt(a.steps)],['Aerobic training effect',a.aerobicEffect==null?null:fmt(a.aerobicEffect,1)],['Anaerobic training effect',a.anaerobicEffect==null?null:fmt(a.anaerobicEffect,1)],['Average power',a.averagePower==null?null:fmt(a.averagePower)+' W'],['Maximum power',a.maxPower==null?null:fmt(a.maxPower)+' W'],['Ground contact',a.groundContactMs==null?null:fmt(a.groundContactMs)+' ms'],['Vertical oscillation',a.verticalOscillationCm==null?null:fmt(a.verticalOscillationCm,1)+' cm'],['Stride length',a.strideLengthM==null?null:fmt(a.strideLengthM,2)+' m'],['Best recorded pace',a.bestPaceSeconds==null?null:pace(a.bestPaceSeconds)+' /km']];
  $('#run-detail').innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">${date(a.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p><h2 id="run-title">${esc(a.title)}</h2></div><button class="icon-button close-dialog" aria-label="Close activity details">×</button></div><p class="detail-type">${typeName(a.type).toUpperCase()}${mode==='demo'?' · SAMPLE ACTIVITY':''}</p><dl class="detail-grid">${fields.filter(([,value])=>value!=null).map(([key,value])=>`<div class="detail-item"><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl><p class="detail-note">A dash means this measurement is not in the export. Calories and training effect are device-reported. Pace is calculated from moving time and distance.</p>`;
  $('#run-dialog').showModal();
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),5000);}
function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$$('[data-range]').forEach(button=>button.addEventListener('click',()=>{range=button.dataset.range;limit=8;$$('[data-range]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});summary();activityLog();monthly();}));
$$('[data-type]').forEach(button=>button.addEventListener('click',()=>{type=button.dataset.type;limit=8;$$('[data-type]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});activityLog();}));
$('#run-search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();limit=8;activityLog();});
$('#load-more').addEventListener('click',()=>{limit+=12;activityLog();});
$('#export-csv').addEventListener('click',()=>download(toCSV(filtered()),`gitrun-${today}${mode==='demo'?'-sample':''}.csv`,'text/csv;charset=utf-8'));
$('#import-open').addEventListener('click',()=>$('#data-dialog').showModal());
$('#banner-action').addEventListener('click',()=>$('#data-dialog').showModal());
document.addEventListener('click',e=>{const button=e.target.closest('[data-run]');if(button)detail(button.dataset.run);if(e.target.closest('.close-dialog'))e.target.closest('dialog').close();});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#heatmap-year').innerHTML=Array.from({length:Math.max(1,Number(today.slice(0,4))-2026+1)},(_,i)=>2026+i).reverse().map(y=>`<option value="${y}">${y}</option>`).join('');
$('#heatmap-year').value=heatYear;
$('#heatmap-year').addEventListener('change',e=>{heatYear=Number(e.target.value);heatmap();});
$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;const status=$('#import-status');status.className='status-message';status.textContent='Reading activities…';
  try{
    if(file.size>20*1024*1024)throw new Error('Please use an export smaller than 20 MB.');
    const {activities:imported,skipped}=parseImport(await file.text(),file.name,$('#import-units').value);
    const payload={version:1,source:'Garmin export',updatedAt:new Date().toISOString(),activities:imported};
    let saved=true;try{localStorage.setItem(storeKey,JSON.stringify(payload));}catch{saved=false;}
    activities=imported;updatedAt=payload.updatedAt;mode='local';range='all';type='all';query='';limit=8;$('#run-search').value='';
    $$('[data-range]').forEach(b=>{b.classList.toggle('selected',b.dataset.range===range);b.setAttribute('aria-pressed',String(b.dataset.range===range));});
    $$('[data-type]').forEach(b=>{b.classList.toggle('selected',b.dataset.type===type);b.setAttribute('aria-pressed',String(b.dataset.type===type));});render();
    status.className='status-message success';status.textContent=`Imported ${imported.length} runs; ${all().length} fall between July 2026 and today.${skipped?` Skipped ${skipped} non-running activities.`:''}${saved?' Saved in this browser.':' Browser storage is full or unavailable. Download website data to keep this import before closing the page.'}`;
    toast(`${all().length} runs added to your journal`);
  }catch(error){status.className='status-message error';status.textContent=error.message;}finally{e.target.value='';}
});
$('#download-json').addEventListener('click',()=>{if(mode==='demo')return;download(JSON.stringify({version:1,source:'Garmin export',updatedAt,activities},null,2)+'\n','activities.json','application/json');});
$('#reset-data').addEventListener('click',()=>{try{localStorage.removeItem(storeKey);}catch{toast('Browser storage could not be cleared.');return;}activities=publishedReady?published:demoActivities();mode=publishedReady?'published':'demo';updatedAt=publishedUpdated;$('#import-status').textContent='Browser import cleared. Showing the website’s data.';render();});
let publishedUpdated=null;
async function init(){
  let loadError=false;
  try{await loadPublished();}
  catch{loadError=true;}
  activities=publishedReady?published:demoActivities();mode=publishedReady?'published':'demo';updatedAt=publishedUpdated;
  try{const saved=localStorage.getItem(storeKey);if(saved){const data=JSON.parse(saved);if(data.version!==1)throw new Error('Unsupported data');activities=validateActivities(data.activities);updatedAt=data.updatedAt;mode='local';}}catch{toast('Saved browser data could not be read. Showing the website data.');}
  render();if(loadError){$('#data-state').textContent=mode==='local'?'Showing browser import · Website data could not be loaded.':'Website data could not be loaded · Showing sample activities.';}
}
async function loadPublished(){
  const response=await fetch('./data/activities.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Data unavailable');
  const data=await response.json();if(data.version!==1)throw new Error('Unsupported data');
  const validated=validateActivities(data.activities);
  published=validated;publishedUpdated=data.updatedAt;publishedSource=data.source==='Garmin Connect'?'Garmin Connect':'Garmin export';publishedReady=validated.length>0||Boolean(data.updatedAt);
}
await init();
setInterval(async()=>{try{const before=publishedUpdated;await loadPublished();if(mode!=='local'&&publishedReady&&before!==publishedUpdated){activities=published;mode='published';updatedAt=publishedUpdated;render();}}catch{/* Preserve the current history if the network is temporarily unavailable. */}},300000);
setInterval(()=>{const next=dateKey();if(next!==today){today=next;const year=Number(today.slice(0,4));if(![...$('#heatmap-year').options].some(o=>Number(o.value)===year))$('#heatmap-year').insertAdjacentHTML('afterbegin',`<option value="${year}">${year}</option>`);render();}},60000);
