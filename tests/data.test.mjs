import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,importGarminCSV,parseImport,validateActivities,inRange,totals,weeks,consecutiveWeeks,toCSV,seconds} from '../dist/data.mjs';
const activity=(date,extras={})=>({id:date,date,title:'Run',type:'road',distanceKm:5,movingSeconds:1800,...extras});
test('history begins July 2026, excludes future runs, and grows into subsequent years',()=>{
  const data=['2026-06-30','2026-07-01','2026-12-31','2027-01-01','2027-01-02'].map(d=>activity(d));
  assert.equal(inRange(data,'all','2027-01-01').length,3);
  assert.deepEqual(inRange(data,'year','2027-01-01').map(a=>a.date),['2027-01-01']);
  assert.deepEqual(inRange(data,'week','2026-07-01').map(a=>a.date),['2026-07-01']);
});
test('totals weight pace by distance and HR by time; missing energy stays missing',()=>{
  const t=totals([activity('2026-07-01',{distanceKm:10,movingSeconds:3600,averageHR:150}),activity('2026-07-02',{distanceKm:5,movingSeconds:2400,averageHR:170})]);
  assert.equal(t.pace,400);assert.equal(t.averageHR,158);assert.equal(t.calories,null);assert.equal(t.calorieCount,0);
  assert.equal(totals([activity('2026-07-01',{calories:0})]).calories,0);
});
test('Garmin CSV handles BOM, escaped quotes, commas, multiline names, missing sensors, and excludes cycling',()=>{
  const text='\uFEFFActivity Type,Date,Title,Distance,Time,Calories,Avg HR,Total Ascent\r\nRunning,2026-07-01 06:30:00,"Morning, ""easy""\nrun",10.50,01:05:30,"1,000",--,50\r\nCycling,2026-07-02,Ride,20,01:00:00,500,130,20';
  const result=importGarminCSV(text);assert.equal(result.activities.length,1);assert.equal(result.skipped,1);
  assert.equal(result.activities[0].title,'Morning, "easy"\nrun');assert.equal(result.activities[0].movingSeconds,3930);assert.equal(result.activities[0].calories,1000);assert.equal(result.activities[0].averageHR,null);
});
test('imperial Garmin exports convert distance, elevation, and pace consistently',()=>{
  const r=importGarminCSV('Activity Type,Date,Distance,Time,Total Ascent,Best Pace\nTrail Running,2026-07-03,10,01:20:00,100,08:00','imperial').activities[0];
  assert.equal(r.distanceKm,16.09344);assert.equal(r.elevationM,30.48);assert.ok(Math.abs(r.bestPaceSeconds-298.258)<.001);assert.equal(r.type,'trail');
});
test('malformed imports fail without replacing valid data; duplicate IDs are removed',()=>{
  assert.throws(()=>parseCSV('a,"unclosed'));
  assert.throws(()=>importGarminCSV('Activity Type,Date,Distance,Time\nRunning,2026-02-30,5,00:30:00'));
  assert.throws(()=>parseImport('{"version":2,"activities":[]}','activities.json'));
  assert.throws(()=>validateActivities([activity('2026-07-01',{distanceKm:-1})]));
  assert.equal(validateActivities([activity('2026-07-01'),activity('2026-07-01')]).length,1);
  assert.equal(seconds('1:99:10'),null);
});
test('partial sensor totals identify coverage and repeated same-day runs count one active day',()=>{
  const t=totals([activity('2026-07-01',{calories:300}),activity('2026-07-01',{calories:null})]);
  assert.equal(t.calories,300);assert.equal(t.calorieCount,1);assert.equal(t.activeDays,1);assert.equal(t.count,2);
});
test('weekly buckets span a year boundary and streak allows the current week to be in progress',()=>{
  const data=['2026-12-21','2026-12-28','2027-01-04'].map(d=>activity(d));
  const buckets=weeks(data,'2027-01-11',4);assert.equal(buckets[0].start,'2026-12-21');assert.equal(buckets.at(-1).count,0);
  assert.equal(consecutiveWeeks(data,'2027-01-11'),3);assert.equal(consecutiveWeeks(data,'2027-01-18'),0);
});
test('published records have an allowlist and CSV exports neutralize spreadsheet formulas',()=>{
  const a=validateActivities([activity('2026-07-01',{title:'=HYPERLINK("bad")',latitude:-6,access_token:'SECRET'})])[0];
  assert.equal(a.latitude,undefined);assert.equal(a.access_token,undefined);assert.ok(toCSV([a]).includes("'=HYPERLINK"));
});
