// Illustrative fixtures, never a claim about the owner's running history.
export function demoActivities(){
  const activities=[];const start=new Date('2026-07-01T12:00:00');
  for(let i=0;i<75;i++){
    const day=new Date(start);day.setDate(day.getDate()+i);const weekday=day.getDay();
    if(![0,2,4,6].includes(weekday)||i===24||i===34)continue;
    const trail=weekday===0&&i%3===0,long=weekday===0;
    const distanceKm=Number((long?11+(i%8)*.85:weekday===4?6.2+(i%5)*.64:4.8+(i%6)*.52).toFixed(2));
    const pace=trail?426+(i%4)*12:long?373+(i%6)*3:weekday===4?326+(i%6)*4:373+(i%5)*4;
    const movingSeconds=Math.round(distanceKm*pace);const elevationM=trail?268+(i%5)*65:12+(i%7)*11;
    activities.push({id:`demo-${i}`,date:`2026-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`,title:trail?'A little higher':long?'Sunday long run':weekday===4?'Picking up the pace':weekday===6?'Saturday easy miles':'Morning miles',type:trail?'trail':'road',distanceKm,movingSeconds,elapsedSeconds:movingSeconds+40+i*3,elevationM,descentM:elevationM-3,calories:Math.round(distanceKm*64),averageHR:trail?151:weekday===4?161:142+i%9,maxHR:171+i%11,cadence:165+i%10,steps:Math.round(movingSeconds/60*(165+i%10)),aerobicEffect:Number((2.5+i%5*.3).toFixed(1)),anaerobicEffect:weekday===4?1.5:0.2,averagePower:238+i%40});
  }return activities.reverse();
}
