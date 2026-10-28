const { chromium } = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const widths = [320,375,390,430,768,1024,1280,1440,1920];
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? (['dist','.git','qa'].includes(e.name)?[]:walk(path.join(dir,e.name))) : e.name.endsWith('.html')?[path.relative(root,path.join(dir,e.name)).replaceAll('\\','/')]:[]); }
async function measure(page) { return page.evaluate(() => {
 const visible=e=>!!e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && !e.closest('[hidden],[aria-hidden="true"]');
 const label=e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,100)});
 const clips=[];
 for(const e of document.querySelectorAll('h1,h2,h3,h4,p,a,button,strong,li')) {if(!visible(e)||!e.textContent.trim())continue;const s=getComputedStyle(e);if((e.scrollWidth>e.clientWidth+3&&e.clientWidth>0&&s.overflowX==='hidden')||(e.scrollHeight>e.clientHeight+4&&e.clientHeight>0&&s.overflowY==='hidden'))clips.push(label(e));}
 return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,offscreen:[...document.querySelectorAll('main *')].filter(e=>{if(!visible(e))return false;let r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left< -2)&&!e.closest('.trending-viewport');}).slice(0,8).map(label),clips,brokenImages:[...document.images].filter(e=>visible(e)&&e.complete&&!e.naturalWidth).map(e=>e.getAttribute('src')),headings:[...document.querySelectorAll('h1')].filter(visible).map(e=>e.textContent.trim()),sections:[...document.querySelectorAll('main > section,main > div > section')].filter(visible).map(e=>({cls:e.className,height:Math.round(e.getBoundingClientRect().height),text:e.textContent.trim().slice(0,60)}))};
 }); }
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});const routes=walk(root);const results=[];let tasks=routes.flatMap(route=>widths.map(width=>({route,width})));
 await Promise.all(Array.from({length:4},async()=>{const page=await browser.newPage();while(tasks.length){const {route,width}=tasks.shift();await page.setViewportSize({width,height:900});const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);try{const res=await page.goto('http://127.0.0.1:8000/'+route,{waitUntil:'load'});await page.evaluate(async()=>{document.querySelectorAll('img[loading="lazy"]').forEach(e=>e.loading='eager');await document.fonts.ready;});await page.waitForTimeout(120);results.push({route,status:res.status(),...await measure(page),errors});}catch(e){results.push({route,width,error:e.message});}page.off('pageerror',listener);if(results.length%50===0)console.log('Checked '+results.length+'/'+routes.length*widths.length); }await page.close();}));
 fs.writeFileSync(path.join(__dirname,'responsive-retest-results-2026-10-28.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({routes:routes.length,checks:results.length,issues:results.filter(r=>r.overflow||r.brokenImages?.length||r.errors?.length||r.error)},null,2));
 if(process.argv.includes('--scan-only')) {await browser.close();return;}
 const page=await browser.newPage();for(const route of ['index.html','the-market.html','business/vestano-projects-property.html','industries/villa-projects.html','all-businesses.html','services/retail-supermarket-consulting.html'])for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:8000/'+route);await page.evaluate(async()=>{document.querySelectorAll('img').forEach(e=>e.loading='eager');await document.fonts.ready;});await page.waitForTimeout(400);await page.screenshot({path:path.join(__dirname,route.replaceAll('/','-')+'-'+width+'.png'),fullPage:true});}
 await browser.close();
})();
