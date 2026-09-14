import {readFile,writeFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {parseImport} from '../dist/data.mjs';
const [file,units='metric']=process.argv.slice(2);
if(!file||!['metric','imperial'].includes(units)){
  console.error('Usage: npm run import -- /path/to/Activities.csv [metric|imperial]');process.exit(1);
}
try{
  const {activities,skipped}=parseImport(await readFile(resolve(file),'utf8'),basename(file),units);
  await writeFile(new URL('../dist/data/activities.json',import.meta.url),JSON.stringify({version:1,source:'Garmin export',updatedAt:new Date().toISOString(),activities},null,2)+'\n');
  console.log(`Imported ${activities.length} runs; skipped ${skipped} non-running activities. Website data updated.`);
}catch(error){console.error(error.message);process.exit(1);}
