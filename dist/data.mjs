export const START = '2026-07-01';
export const DAY = 86400000;
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const asDate = value => new Date(`${String(value).slice(0,10)}T12:00:00`);
export const addDays = (value, days) => { const d = asDate(value); d.setDate(d.getDate()+days); return dateKey(d); };
export const monday = value => addDays(value, -((asDate(value).getDay()+6)%7));
export const round = (n, places=1) => Number(n.toFixed(places));
export const isRunning = type => /^(running|run|trail running|trail run|treadmill running|treadmill run|track running|track run|virtual run|ultra run|ultra running|indoor running)$/i.test(String(type).trim());
export const number = value => {
  if (value == null || String(value).trim() === '' || /^(--|—|n\/a|null)$/i.test(String(value).trim())) return null;
  const n = Number(String(value).replace(/,/g,'').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function seconds(value) {
  if (value == null || String(value).trim() === '') return null;
  const parts = String(value).trim().split(':');
  if (parts.length === 1) return number(value);
  if (parts.length > 3 || parts.some(p => number(p) == null) || parts.slice(1).some(p => Number(p) >= 60)) return null;
  return parts.reduce((sum, p) => sum*60+Number(p),0);
}
export function parseCSV(text) {
  const rows=[]; let row=[], field='', quoted=false;
  text = text.replace(/^\uFEFF/,'');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"'){field+='"';i++;} else if(!quoted && field===''){quoted=true;} else if(quoted){quoted=false;} else {field+=c;} }
    else if(c===',' && !quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r') && !quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('The CSV has an unclosed quoted field. Please export it again.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
function validDate(value) {
  const key=String(value ?? '').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(asDate(key).getTime()) && dateKey(asDate(key))===key ? key : null;
}
export function validateActivities(items) {
  if(!Array.isArray(items))throw new Error('Expected an activities array.');
  const seen=new Set();
  return items.map((a,i)=>{
    const date=validDate(a.date), distanceKm=number(a.distanceKm), movingSeconds=number(a.movingSeconds);
    if(!date || distanceKm==null || movingSeconds==null)throw new Error(`Activity ${i+1} has an invalid date, distance, or time.`);
    const clean={id:String(a.id || `${date}-${distanceKm}-${movingSeconds}`),date,title:String(a.title || 'Run').slice(0,200),type:a.type==='trail'?'trail':a.type==='treadmill'?'treadmill':'road',distanceKm,movingSeconds};
    for(const k of ['elapsedSeconds','elevationM','descentM','calories','averageHR','maxHR','cadence','maxCadence','steps','aerobicEffect','anaerobicEffect','averagePower','maxPower','groundContactMs','verticalOscillationCm','strideLengthM','bestPaceSeconds'])clean[k]=number(a[k]);
    return clean;
  }).filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);return true;}).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
export function importGarminCSV(text, units='metric') {
  const rows=parseCSV(text);
  if(rows.length<2)throw new Error('This file has no activities to import.');
  const headers=rows.shift().map(h=>h.trim().toLowerCase());
  if(!['activity type','date','distance','time'].every(h=>headers.includes(h)))throw new Error('Use an English-language Garmin activities CSV with Activity Type, Date, Distance, and Time columns.');
  const activities=[];let skipped=0;
  for(const [index, row] of rows.entries()) {
    const get=(...names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0 && row[i]?.trim())return row[i].trim();}return null;};
    const type=get('activity type');if(!isRunning(type)){skipped++;continue;}
    const date=validDate(get('date')),distance=number(get('distance')),time=seconds(get('moving time','time'));
    if(!date||distance==null||time==null)throw new Error(`CSV row ${index+2} has an invalid date, distance, or time. Dates must use YYYY-MM-DD.`);
    const scale=units==='imperial'?1.609344:1, elevationScale=units==='imperial'?0.3048:1;
    const scaled=(value,multiplier)=>{const n=number(value);return n==null?null:round(n*multiplier,3);};
    activities.push({id:get('activity id') || `garmin-${get('date')}-${distance}-${time}`,date,title:get('title')||'Run',type:/trail/i.test(type)?'trail':/treadmill|indoor/i.test(type)?'treadmill':'road',distanceKm:round(distance*scale,5),movingSeconds:time,elapsedSeconds:seconds(get('elapsed time','time')),elevationM:scaled(get('total ascent','elevation gain'),elevationScale),descentM:scaled(get('total descent'),elevationScale),calories:number(get('calories')),averageHR:number(get('avg hr','average heart rate')),maxHR:number(get('max hr')),cadence:number(get('avg run cadence','avg cadence')),maxCadence:number(get('max run cadence','max cadence')),steps:number(get('steps')),aerobicEffect:number(get('aerobic te','aerobic training effect')),anaerobicEffect:number(get('anaerobic te','anaerobic training effect')),averagePower:number(get('avg power')),maxPower:number(get('max power')),groundContactMs:number(get('avg ground contact time')),verticalOscillationCm:number(get('avg vertical oscillation')),strideLengthM:number(get('avg stride length')),bestPaceSeconds:seconds(get('best pace'))==null?null:seconds(get('best pace'))/scale});
  }
  if(!activities.length)throw new Error('No running activities found. Export running activities in English from Garmin Connect.');
  return {activities:validateActivities(activities),skipped};
}
export function parseImport(text, filename, units='metric') {
  if(filename.toLowerCase().endsWith('.json')){
    const data=JSON.parse(text);
    if(data.version!==1)throw new Error('This is not a supported Gitrun JSON export (version 1).');
    return {activities:validateActivities(data.activities),skipped:0};
  }
  return importGarminCSV(text,units);
}
export function inRange(activities, range='all', today=dateKey()) {
  let start=START;
  if(range==='week')start=addDays(today,-6);
  if(range==='month')start=addDays(today,-29);
  if(range==='year')start=`${today.slice(0,4)}-01-01`;
  start=start<START?START:start;
  return activities.filter(a=>a.date>=start && a.date<=today);
}
export function totals(activities) {
  const sum=key=>activities.reduce((n,a)=>n+(a[key]??0),0);
  const known=key=>activities.filter(a=>a[key]!=null);
  const hr=known('averageHR').filter(a=>a.movingSeconds>0);
  const distanceKm=sum('distanceKm'),movingSeconds=sum('movingSeconds');
  return {count:activities.length,distanceKm,movingSeconds,elevationM:known('elevationM').length?sum('elevationM'):null,calories:known('calories').length?sum('calories'):null,calorieCount:known('calories').length,elevationCount:known('elevationM').length,pace:distanceKm>0?movingSeconds/distanceKm:null,averageHR:hr.length?hr.reduce((s,a)=>s+a.averageHR*a.movingSeconds,0)/hr.reduce((s,a)=>s+a.movingSeconds,0):null,activeDays:new Set(activities.map(a=>a.date)).size,longest:activities.length?Math.max(...activities.map(a=>a.distanceKm)):0};
}
export function weeks(activities,today=dateKey(),count=12) {
  const last=monday(today);
  return Array.from({length:count},(_,i)=>{const start=addDays(last,(i-count+1)*7),end=addDays(start,6);return {start,end,...totals(activities.filter(a=>a.date>=start&&a.date<=end&&a.date<=today))};});
}
export function months(activities) {
  const keys=[...new Set(activities.map(a=>a.date.slice(0,7)))].sort().reverse();
  return keys.map(month=>({month,...totals(activities.filter(a=>a.date.startsWith(month)))}));
}
export function consecutiveWeeks(activities,today=dateKey()) {
  const active=new Set(activities.map(a=>monday(a.date)));let current=monday(today),count=0;
  if(!active.has(current))current=addDays(current,-7);
  while(active.has(current)){count++;current=addDays(current,-7);}return count;
}
export function toCSV(activities) {
  const fields=['date','title','type','distanceKm','movingSeconds','elapsedSeconds','elevationM','calories','averageHR','maxHR','cadence','steps','averagePower'];
  const quote=value=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;
  return [fields.join(','),...activities.map(a=>fields.map(k=>quote(a[k])).join(','))].join('\r\n');
}
