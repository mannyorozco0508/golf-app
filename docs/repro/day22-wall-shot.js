// Run from the repo root: node docs/repro/day22-wall-shot.js <android|ios|web> <out.png>  (job 015). Diagnostic only.
// Day 22 on Android, locally: Chrome, Capacitor says android, the Firebase stand-in holds an
// organizer first seen 22 days ago and refuses the round write (as the live rule would).
// The wizard is walked with its own controls and Save is a real tap. No live database.
const path = require('path'); const HERE = path.join(__dirname, '..', '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const platform = process.argv[2] || 'android', out = process.argv[3];
const DAY = 86400000;
const CAPSTUB = platform === 'web' ? '' : "window.Capacitor = { getPlatform: function () { return '" + platform + "'; }, isNativePlatform: function () { return true; }, Plugins: {} };";
const REFUSE = "(function(){var t=setInterval(function(){if(!window.firebase||!firebase.database)return;clearInterval(t);var d=firebase.database;firebase.database=function(){var db=d.apply(this,arguments);if(db.__walled)return db;db.__walled=true;var r=db.ref;db.ref=function(p){var ref=r.apply(this,arguments);if(/^(events\\/|organizers\\/[^\\/]+\\/firstSeenAt)/.test(String(p||''))){var no=function(){var e=new Error('PERMISSION_DENIED: Permission denied');e.code='PERMISSION_DENIED';return Promise.reject(e);};ref.update=no;ref.set=no;}return ref;};return db;};},0);})();";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message))});";
(async () => {
  const r = await arriveCold({ url: fileUrl('admin.html', ''), viewport: { width: 412, height: 915 }, settleMs: 2500,
    db: { events: {}, trips: {}, organizers: { 'anon-cold': { firstSeenAt: Date.now() - 22 * DAY } }, global_courses: {}, tournaments: {} },
    preScript: CAPSTUB + ERR + REFUSE,
    steps: [
      { expression: "(() => { const g=Array.from(document.querySelectorAll('button,div,a')).filter(e=>e.offsetParent!==null&&/^\\s*\\S*\\s*Game Day/.test(e.innerText||'')).sort((a,b)=>a.innerText.length-b.innerText.length)[0]; if(g){g.click(); return 'game day';} return 'no game day'; })()" }, { sleep: 2500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const s=document.getElementById('course-search-input'); if(!s||s.offsetParent===null) return 'no course input'; s.value='True Blue Golf Club'; s.dispatchEvent(new Event('input',{bubbles:true})); const o=Array.from(document.querySelectorAll('#course-dropdown .custom-select-option')).find(x=>/trueblue/.test(x.getAttribute('onclick')||'')); if(o)o.click(); return 'course '+!!o; })()" },
      { sleep: 600 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { expression: "(() => { const b=document.getElementById('main-save-btn'); if (b && b.offsetParent!==null) return 'at review'; const n=Array.from(document.querySelectorAll('.wizard-btn-next')).find(x=>x.offsetParent!==null); if(!n) return 'no next'; n.click(); return 'next'; })()" }, { sleep: 500 },
      { tap: '#main-save-btn' }, { sleep: 1500 },
      { expression: "(() => { const b=Array.from(document.querySelectorAll('button')).find(x=>x.offsetParent!==null&&/Start it anyway/.test(x.innerText)); if(b){b.click(); return 'anyway';} return 'no prompt'; })()" }, { sleep: 4000 },
      { expression: "JSON.stringify({ note: (Array.from(document.querySelectorAll('*')).filter(e=>e.offsetParent!==null&&/paused|trial has ended|Save error/i.test(e.innerText||'')&&e.children.length<6).map(e=>e.innerText).sort((a,b)=>a.length-b.length)[0]||null), e: window.__e })" },
      { expression: "(() => { const el=Array.from(document.querySelectorAll('*')).filter(e=>e.offsetParent!==null&&/paused|trial has ended/i.test(e.innerText||'')).sort((a,b)=>a.innerText.length-b.innerText.length)[0]; if(el) el.scrollIntoView({block:'center'}); return !!el; })()" },
      { sleep: 400 }, { shot: out } ] });
  console.log(r.ok ? JSON.stringify(r.value) : 'harness: ' + r.reason);
})();
