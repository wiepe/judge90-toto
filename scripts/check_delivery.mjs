import { readJSON,saveJSON,publicationWindow } from './lib/operation.mjs';
const status=readJSON('data/update_status.json');
const report={checked_at:new Date().toISOString(),data_state:status.state,commit:process.env.PUBLISHED_COMMIT||null,pages_delivered:process.env.PAGES_DELIVERED==='true'};
if(status.state==='success')Object.assign(report,publicationWindow(readJSON('predictions.json'),new Date(),0));
saveJSON('delivery-status.json',report);
console.log(JSON.stringify(report,null,2));
if(!report.pages_delivered||report.on_time===false)process.exitCode=1;
