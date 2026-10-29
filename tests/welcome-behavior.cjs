const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'welcome.js'), 'utf8');
function setup({seen=false, blocked=false, hash='', search='', navigationType='reload'}={}) {
  const events={}, classes=new Set(); let dismissed=seen, open=false;
  const previous={focus(){this.restored=true}};
  const close={addEventListener(type, handler){this[type]=handler},focus(){document.activeElement=this}};
  const last={focus(){document.activeElement=this}};
  const dialog={querySelector(){return close},querySelectorAll(){return [close,last]},addEventListener(type,fn){events[type]=fn},showModal(){open=true;document.activeElement=close},close(){open=false;events.close()}};
  const document={activeElement:previous,querySelector(){return dialog},body:{classList:{add(c){classes.add(c)},remove(c){classes.delete(c)}}}};
  vm.runInNewContext(source,{document,performance:{getEntriesByType(){return navigationType ? [{type:navigationType}] : []}},location:{hash,search},URLSearchParams,HTMLElement:Object,localStorage:{getItem(){if(blocked)throw Error('Storage denied');return dismissed?'true':null},setItem(){if(blocked)throw Error('Storage denied');dismissed=true}}});
  return {events,close,last,document,previous,classes,get open(){return open},get dismissed(){return dismissed}};
}
let s=setup(); assert(s.open); assert(s.classes.has('welcome-is-open'));
s.events.cancel({preventDefault(){}}); assert(!s.open); assert(!s.dismissed); assert(!s.classes.has('welcome-is-open')); assert(s.previous.restored);
assert(setup({seen:true}).open);
assert(setup({hash:'#contact'}).open);
assert(setup({search:'?menu=about'}).open);
s=setup({blocked:true}); assert(s.open); s.close.click(); assert(!s.open);
s=setup(); s.events.click({target:{closest(){return {href:'leadership.html'}}}}); assert(!s.open); assert(!s.dismissed);
s=setup(); s.events.keydown({key:'Tab',shiftKey:true,preventDefault(){}}); assert.equal(s.document.activeElement,s.last);
s.events.keydown({key:'Tab',shiftKey:false,preventDefault(){}}); assert.equal(s.document.activeElement,s.close);
assert(!setup({navigationType:'navigate'}).open);
assert(!setup({navigationType:'back_forward'}).open);
assert(!setup({navigationType:null}).open);
console.log('PASS: popup on refresh only; normal navigation and history stay closed; Escape, focus restoration, link dismissal and focus cycling.');
