import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & BRAND
// ═══════════════════════════════════════════════════════════════════════════════

const VENDORS = {
  "Link International":  { address:"6/56 Boundary Rd, Rocklea QLD 4106",       phone:"+61 7 3373 1000", email:"sales@linkint.com.au" },
  "A1 Accessories":      { address:"45 Proprietary St, Tingalpa QLD 4173",      phone:"+61 7 3390 3999", email:"info@a1accessories.com.au" },
  "McLeods":             { address:"42 Hargraves St, Castlemaine VIC 3450",      phone:"+61 3 5472 1000", email:"sales@mcleods.com.au" },
  "Gas Imports":         { address:"12 Rushdale St, Knoxfield VIC 3180",         phone:"+61 3 9765 9900", email:"info@gasimports.com.au" },
  "Ficeda":              { address:"7 Stanton Rd, Seven Hills NSW 2147",          phone:"+61 2 8822 0222", email:"orders@ficeda.com.au" },
  "Whites Powersports":  { address:"1/22 Anzac Ave, Smeaton Grange NSW 2567",    phone:"+61 2 4648 2300", email:"sales@whitespowersports.com.au" },
};

// Pricing from flyer (ex GST)
const TYRE_PRICING = [
  { minQty:1, maxQty:1, label:"1 Tyre",   price:16.80 },
  { minQty:2, maxQty:2, label:"2 Tyres",  price:21.60 },
  { minQty:3, maxQty:3, label:"3 Tyres",  price:30.00 },
  { minQty:4, maxQty:999,label:"4+ Tyres",price:null, perItem:11.20 },
];

const PARTS_PRICING = [
  { key:"p1", label:"Up to 5kg",  price:15.60, note:null },
  { key:"p2", label:"5–10kg",     price:19.20, note:null },
  { key:"p3", label:"10kg+",      price:22.80, note:"From $22.80 (subject to handling approval)" },
];

const ADDITIONAL_PRICING = [
  { label:"Returns to Supplier",    price:6.00,  note:"Per package (pre-labelled)" },
  { label:"Oversized/Bulk Items",   price:null,  note:"By approval only" },
];

// Calculate tyre price from total count
function calcTyrePrice(qty) {
  if (!qty || qty < 1) return 0;
  if (qty === 1) return 16.80;
  if (qty === 2) return 21.60;
  if (qty === 3) return 30.00;
  return 11.20 * qty; // 4+
}

function calcPartsTotal(partQtys) {
  let total = 0;
  for (const [key, qty] of Object.entries(partQtys || {})) {
    if (!qty || qty < 1) continue;
    const p = PARTS_PRICING.find(x => x.key === key);
    if (p?.price) total += p.price * qty;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

function initStore() {
  return {
    users: [
      { id:"admin", name:"Super Admin", email:"admin@motoandco.com.au", role:"admin"  },
      { id:"drv1",  name:"Jake Morrow", email:"jake@motoandco.com.au",  role:"driver" },
    ],
    clients:    [],
    orders:     [],
    deliveries: [],
  };
}

const API_BASE = (import.meta.env.VITE_MOTOCO_API_BASE_URL || "/api/live").replace(/\/$/, "");
let liveStore = initStore();
const storeListeners = new Set();

function cloneStore(s) {
  return JSON.parse(JSON.stringify(s));
}

function notifyStore() {
  storeListeners.forEach(fn => fn(cloneStore(liveStore)));
}

async function apiJSON(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type":"application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "Server request failed.");
  return body;
}

async function loadLiveStore() {
  const data = await apiJSON("/workspace");
  liveStore = data.store || initStore();
  notifyStore();
  return cloneStore(liveStore);
}

function subscribeStore(fn) {
  storeListeners.add(fn);
  return () => storeListeners.delete(fn);
}

const gs  = () => cloneStore(liveStore);
const mut = (fn) => {
  const g = cloneStore(liveStore);
  fn(g);
  liveStore = g;
  notifyStore();
  apiJSON("/snapshot", { method:"PUT", body:JSON.stringify({ store:g }) }).catch(console.error);
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZOHO
// ═══════════════════════════════════════════════════════════════════════════════

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); } catch { return null; }
}

async function zohoCRMSync(client) {
  try {
    const r = await apiJSON("/zoho/crm/client", { method:"POST", body:JSON.stringify({ client }) });
    return { ok:true, text:JSON.stringify(r) };
  } catch(e) { return { ok:false, text:"", error:e.message }; }
}

async function zohoBooksInvoice(client, deliveries, monthLabel) {
  const total = deliveries.reduce((s,d)=>s+(d.totalPrice||0),0);
  const lines = deliveries.map(d => {
    const parts = [];
    if (d.tyreQty > 0) parts.push(`${d.tyreQty} tyre(s) @ $${d.tyrePrice?.toFixed(2)}`);
    if (d.partsTotal > 0) parts.push(`Parts $${d.partsTotal?.toFixed(2)}`);
    if (d.returnsQty > 0) parts.push(`${d.returnsQty} return(s) $${(d.returnsQty*6).toFixed(2)}`);
    return `${d.conNote} (${d.vendor}): ${parts.join(", ")} = $${(d.totalPrice||0).toFixed(2)}`;
  }).join("; ");
  try {
    const r = await apiJSON("/zoho/books/invoice", {
      method:"POST",
      body:JSON.stringify({ client, deliveries, monthLabel, lines, total }),
    });
    return { ok:true, text:JSON.stringify(r) };
  } catch(e) { return { ok:false, text:"", error:e.message }; }
}

async function zohoCRMFetch() {
  try {
    const r = await apiJSON("/zoho/crm/contacts");
    return { ok:true, text:JSON.stringify(r.contacts || []) };
  } catch(e) { return { ok:false, text:"", error:e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES — Brand accurate: Barlow Condensed, crimson #e11d48, cream #f3f3e8
// ═══════════════════════════════════════════════════════════════════════════════

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

*{box-sizing:border-box;margin:0;padding:0}
:root{
  --cream:#f3f3e8;
  --cream2:#ececdf;
  --cream3:#deded2;
  --red:#e11d48;
  --red2:#be123c;
  --red3:#fb7185;
  --red-bg:rgba(225,29,72,.06);
  --red-border:rgba(225,29,72,.2);
  --tx:#1A1510;
  --tx2:#2E2820;
  --mu:#7A6E60;
  --mu2:#9A8E80;
  --b1:#D5CFC3;
  --b2:#C5BFB3;
  --ok:#1A6E3A;
  --ok-bg:rgba(26,110,58,.07);
  --warn:#8B6914;
}
body{background:var(--cream);color:var(--tx);font-family:'Barlow',sans-serif;min-height:100vh}
.app{min-height:100vh;display:flex;flex-direction:column}

/* ── NAV ── */
.nav{background:var(--red);padding:0 2rem;display:flex;align-items:center;justify-content:space-between;height:56px;position:sticky;top:0;z-index:999;box-shadow:0 3px 16px rgba(0,0,0,.22)}
.logo{display:flex;flex-direction:column;line-height:1}
.logo-top{font-family:'Barlow Condensed',sans-serif;font-weight:400;font-size:.75rem;letter-spacing:3px;color:rgba(242,237,227,.65);text-transform:uppercase}
.logo-main{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1.55rem;letter-spacing:2px;color:#f3f3e8;text-transform:uppercase;line-height:1}
.logo-main em{color:#f3f3e8;font-style:normal;font-weight:400}
.logo-sub{font-family:'Barlow Condensed',sans-serif;font-size:.6rem;letter-spacing:3px;color:rgba(242,237,227,.5);text-transform:uppercase;margin-top:1px}
.ntabs{display:flex;gap:1px}
.nt{padding:6px 14px;border:none;background:none;color:rgba(242,237,227,.65);font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer;border-radius:2px;transition:all .13s;text-transform:uppercase;letter-spacing:1px}
.nt:hover{color:#f3f3e8;background:rgba(255,255,255,.1)}
.nt.on{color:#f3f3e8;background:rgba(255,255,255,.18);border-bottom:3px solid #f3f3e8}
.nav-r{display:flex;align-items:center;gap:10px}
.nav-nm strong{display:block;font-size:.82rem;color:#f3f3e8;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px;text-transform:uppercase}
.nav-nm span{font-size:.6rem;color:rgba(242,237,227,.55);text-transform:uppercase;letter-spacing:1px}
.rpill{padding:2px 8px;border-radius:2px;font-size:.58rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;border:1px solid rgba(242,237,227,.35);color:rgba(242,237,227,.8)}
.btn-out{border:1px solid rgba(242,237,227,.3);background:none;color:rgba(242,237,227,.7);padding:5px 12px;border-radius:2px;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;transition:all .13s}
.btn-out:hover{border-color:#f3f3e8;color:#f3f3e8}

/* ── AUTH ── */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;background:var(--cream)}
.auth-stripe{position:absolute;top:0;left:0;right:0;height:8px;background:var(--red)}
.auth-card{background:#fff;border:1px solid var(--b1);border-top:5px solid var(--red);border-radius:2px;padding:2.8rem 2.4rem;width:100%;max-width:440px;position:relative;z-index:1;box-shadow:0 4px 32px rgba(0,0,0,.08)}
.auth-logo-wrap{text-align:center;margin-bottom:.3rem}
.auth-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:2.8rem;letter-spacing:3px;color:var(--red);text-transform:uppercase;line-height:1}
.auth-logo em{color:var(--tx);font-style:normal;font-weight:400}
.auth-tagline{font-family:'Barlow Condensed',sans-serif;font-size:.75rem;letter-spacing:3px;text-transform:uppercase;color:var(--mu);text-align:center;margin-bottom:.2rem}
.auth-sub{text-align:center;font-size:.65rem;letter-spacing:2px;text-transform:uppercase;color:var(--mu2);margin-bottom:2rem;border-bottom:1px solid var(--b1);padding-bottom:.9rem}
.rtabs{display:flex;background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:3px;gap:3px;margin-bottom:1.6rem}
.rtab{flex:1;padding:8px;border:none;background:none;color:var(--mu);font-family:'Barlow Condensed',sans-serif;font-size:.88rem;font-weight:700;cursor:pointer;border-radius:2px;transition:all .13s;text-transform:uppercase;letter-spacing:1px}
.rtab.on{background:var(--red);color:#f3f3e8}

/* ── FORM ── */
.f{margin-bottom:.9rem}
.f label{display:block;font-family:'Barlow Condensed',sans-serif;font-size:.78rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mu);margin-bottom:5px}
.f input,.f select,.f textarea{width:100%;background:#fff;border:1px solid var(--b1);border-radius:2px;padding:10px 12px;color:var(--tx);font-family:'Barlow',sans-serif;font-size:.86rem;transition:border-color .13s;appearance:none}
.f input:focus,.f select:focus,.f textarea:focus{outline:none;border-color:var(--red);box-shadow:0 0 0 3px var(--red-border)}
.f textarea{resize:vertical;min-height:76px}
.f select option{background:#fff;color:var(--tx)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.vgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:4px}
.vck{display:flex;align-items:center;gap:8px;background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:9px 11px;cursor:pointer;transition:all .13s;font-family:'Barlow',sans-serif;font-size:.82rem;font-weight:500}
.vck.on{border-color:var(--red);background:var(--red-bg)}
.vck input{accent-color:var(--red);width:auto;flex-shrink:0}

/* ── BUTTONS ── */
.btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:12px;border:none;border-radius:2px;font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:700;cursor:pointer;transition:all .13s;letter-spacing:1px;text-transform:uppercase}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none !important}
.b-red{background:var(--red);color:#f3f3e8}.b-red:hover:not(:disabled){background:var(--red2);box-shadow:0 3px 12px rgba(225,29,72,.3);transform:translateY(-1px)}
.b-ok{background:var(--ok);color:#f3f3e8}.b-ok:hover:not(:disabled){background:#156030}
.b-ghost{background:transparent;color:var(--tx);border:2px solid var(--b1)}.b-ghost:hover:not(:disabled){border-color:var(--red);color:var(--red)}
.b-cream{background:var(--cream2);color:var(--tx);border:1px solid var(--b1)}.b-cream:hover:not(:disabled){border-color:var(--red);color:var(--red)}
.b-sm{width:auto;padding:7px 14px;font-size:.8rem}
.b-i{width:auto;padding:9px 22px}

/* ── MAIN ── */
.main{flex:1;padding:2rem 1.8rem;max-width:1080px;margin:0 auto;width:100%}
.main.wide{max-width:1320px}

/* ── SECTION HEADER ── */
.sh{margin-bottom:1.6rem;padding-bottom:1rem;border-bottom:2px solid var(--b1);display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:.8rem}
.sh-t{font-family:'Barlow Condensed',sans-serif;font-size:2.2rem;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--tx);line-height:1}
.sh-t span{color:var(--red)}
.sh-d{color:var(--mu);font-size:.8rem;margin-top:3px;font-family:'Barlow',sans-serif}

/* ── CARD ── */
.card{background:#fff;border:1px solid var(--b1);border-radius:2px;padding:1.5rem;margin-bottom:1rem;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.ct{font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--red);margin-bottom:1.1rem;display:flex;align-items:center;gap:.6rem}
.ct::after{content:'';flex:1;height:2px;background:var(--cream2)}

/* ── STATS ── */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:1.4rem}
.stat{background:#fff;border:1px solid var(--b1);border-radius:2px;padding:1rem;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.sn{font-family:'Barlow Condensed',sans-serif;font-size:2.2rem;font-weight:900;line-height:1;margin-bottom:3px}
.sl{font-family:'Barlow Condensed',sans-serif;font-size:.68rem;color:var(--mu);text-transform:uppercase;letter-spacing:1px;font-weight:700}

/* ── BADGES ── */
.bdg{display:inline-block;padding:2px 9px;border-radius:2px;font-family:'Barlow Condensed',sans-serif;font-size:.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;border:1px solid}
.bp{background:var(--red-bg);color:var(--red);border-color:var(--red-border)}
.bt{background:rgba(139,105,20,.1);color:var(--warn);border-color:rgba(139,105,20,.25)}
.bd{background:var(--ok-bg);color:var(--ok);border-color:rgba(26,110,58,.2)}
.bs{background:var(--ok-bg);color:var(--ok);border-color:rgba(26,110,58,.15)}
.bz{background:rgba(139,105,20,.08);color:var(--warn);border-color:rgba(139,105,20,.2)}

/* ── ORDER ROW ── */
.orow{background:#fff;border:1px solid var(--b1);border-left:3px solid var(--b2);border-radius:2px;padding:.85rem 1.1rem;display:grid;align-items:center;margin-bottom:6px;transition:all .13s;gap:.8rem;box-shadow:0 1px 3px rgba(0,0,0,.03)}
.orow:hover{border-left-color:var(--red);box-shadow:0 2px 8px rgba(0,0,0,.07)}
.onum{font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:900;color:var(--red);letter-spacing:1px}
.oi strong{display:block;font-size:.85rem;margin-bottom:2px;color:var(--tx);font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.oi span{color:var(--mu);font-size:.73rem}
.od{font-size:.68rem;color:var(--mu);text-align:right;font-style:italic}

/* ── DRIVER RUN CARDS ── */
.runcard{background:#fff;border:1px solid var(--b1);border-left:4px solid var(--b2);border-radius:2px;padding:1.1rem 1.2rem;margin-bottom:8px;transition:all .15s;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.runcard.picked{border-left-color:var(--ok)}
.rc-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:.65rem}
.rc-con{font-family:'Barlow Condensed',sans-serif;font-size:1.15rem;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:var(--tx)}
.rc-vendor{font-size:.75rem;color:var(--mu);margin-top:2px;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px;text-transform:uppercase}
.rc-body{font-size:.82rem;color:var(--mu);line-height:1.8}
.rc-body strong{color:var(--tx);font-weight:600}
.rc-addr{background:var(--cream2);border:1px solid var(--b1);border-left:3px solid var(--red);border-radius:2px;padding:.65rem .9rem;margin:.5rem 0}
.addr-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.65rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--red);margin-bottom:3px}
.addr-business{font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--tx)}
.addr-street{font-size:.82rem;color:var(--tx2);margin-top:1px}
.addr-phone{font-size:.75rem;color:var(--mu);margin-top:2px}

/* ── SEARCH ── */
.search-bar{display:flex;gap:.6rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center}
.search-bar input,.search-bar select{background:#fff;border:1px solid var(--b1);border-radius:2px;padding:8px 12px;color:var(--tx);font-family:'Barlow',sans-serif;font-size:.82rem;transition:border-color .13s}
.search-bar input:focus,.search-bar select:focus{outline:none;border-color:var(--red)}
.search-bar input{flex:1;min-width:160px}
.search-bar select{appearance:none;min-width:160px}

/* ── SIGN-OFF ── */
.so-wrap{background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:1.3rem;margin-top:.8rem}
.sigbox{position:relative;width:100%;height:115px;background:#fff;border:2px dashed var(--b2);border-radius:2px;overflow:hidden;cursor:crosshair}
.sigbox canvas{position:absolute;inset:0;width:100%;height:100%}
.sigph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75rem;color:var(--mu2);pointer-events:none;font-family:'Barlow',sans-serif;font-style:italic}
.sigclr{position:absolute;top:6px;right:8px;z-index:10;background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:3px 9px;font-size:.62rem;color:var(--mu);cursor:pointer;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px;text-transform:uppercase}

/* ── PRICING DISPLAY ── */
.pr-section{margin-bottom:1.3rem}
.pr-head{font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:.6rem;color:var(--red);display:flex;align-items:center;gap:.5rem}
.pr-head::after{content:'';flex:1;height:1px;background:var(--b1)}
.pr-row{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--cream2);transition:background .12s}
.pr-row:last-child{border-bottom:none}
.pr-row:hover{background:var(--cream2)}
.pr-label{font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.pr-note{font-size:.72rem;color:var(--mu);margin-top:1px}
.pr-price{font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:900;color:var(--red)}

/* ── TYRE COUNTER ── */
.tyre-counter{display:flex;align-items:center;justify-content:center;gap:1.5rem;padding:1.5rem;background:#fff;border:2px solid var(--b1);border-radius:2px;margin-bottom:1rem}
.tyre-btn{width:48px;height:48px;border:2px solid var(--red);background:none;border-radius:2px;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:900;color:var(--red);display:flex;align-items:center;justify-content:center;transition:all .13s;line-height:1}
.tyre-btn:hover:not(:disabled){background:var(--red);color:#f3f3e8}
.tyre-btn:disabled{opacity:.25;cursor:not-allowed}
.tyre-num{font-family:'Barlow Condensed',sans-serif;font-size:4rem;font-weight:900;color:var(--tx);line-height:1;min-width:80px;text-align:center}
.tyre-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--mu);text-align:center;margin-top:3px}

/* ── PARTS QTY ── */
.qty-row{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--cream2);transition:background .12s}
.qty-row:last-child{border-bottom:none}
.qty-row:hover{background:var(--cream2)}
.qty-info{flex:1}
.qty-info strong{font-family:'Barlow Condensed',sans-serif;display:block;font-size:.88rem;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.qty-info span{font-size:.7rem;color:var(--mu)}
.qty-ctrl{display:flex;align-items:center;gap:8px}
.qty-btn{width:28px;height:28px;border:1px solid var(--b1);background:#fff;border-radius:2px;cursor:pointer;font-size:1rem;font-weight:700;color:var(--red);display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;font-family:'Barlow Condensed',sans-serif}
.qty-btn:hover{background:var(--red);color:#f3f3e8;border-color:var(--red)}
.qty-btn:disabled{opacity:.25;cursor:not-allowed}
.qty-num{font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:900;min-width:26px;text-align:center;color:var(--tx)}
.qty-price{font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:900;color:var(--red);min-width:55px;text-align:right}

/* ── TOTAL BAR ── */
.total-bar{background:var(--red);color:#f3f3e8;border-radius:2px;padding:1rem 1.2rem;display:flex;justify-content:space-between;align-items:center;margin:.8rem 0}
.total-bar-lbl{font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:.85}
.total-bar-val{font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:900;line-height:1}
.total-bar-gst{font-size:.65rem;font-weight:400;opacity:.7;margin-left:4px}

/* ── ADMIN ── */
.aw{display:grid;grid-template-columns:255px 1fr;gap:1.1rem;align-items:start}
.clist{background:#fff;border:1px solid var(--b1);border-radius:2px;overflow:hidden;position:sticky;top:64px;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.cl-h{padding:.8rem 1rem;border-bottom:2px solid var(--b1);font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--mu);background:var(--cream2);display:flex;align-items:center;justify-content:space-between}
.cl-i{padding:.82rem 1rem;border-bottom:1px solid var(--cream2);cursor:pointer;transition:all .12s}
.cl-i:last-child{border-bottom:none}
.cl-i:hover{background:var(--cream2)}
.cl-i.on{background:var(--red-bg);border-left:3px solid var(--red)}
.cl-i strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:.88rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;color:var(--tx)}
.cl-i span{font-size:.7rem;color:var(--mu)}

/* ── INVOICE ── */
.inv-l{display:flex;align-items:flex-start;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--cream2);font-size:.82rem}
.inv-l:last-child{border-bottom:none}
.inv-tot{display:flex;align-items:center;justify-content:space-between;padding-top:.9rem;margin-top:.5rem;border-top:3px solid var(--tx)}
.inv-tot strong{font-family:'Barlow Condensed',sans-serif;font-size:1.6rem;font-weight:900;color:var(--red)}

/* ── MONTH FILTER ── */
.mf{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:.9rem}
.mb{padding:4px 12px;border-radius:2px;border:1px solid var(--b1);background:var(--cream2);color:var(--mu);font-family:'Barlow Condensed',sans-serif;font-size:.75rem;cursor:pointer;transition:all .12s;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.mb.on{border-color:var(--red);color:var(--red);background:var(--red-bg)}

/* ── ZOHO ── */
.zoho-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--cream2);font-size:.82rem}
.zoho-row:last-child{border-bottom:none}
.zdot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.zdot-live{background:var(--ok);box-shadow:0 0 6px rgba(26,110,58,.5)}
.zdot-idle{background:var(--warn)}
.sync-bar{display:flex;align-items:center;gap:.6rem;padding:.55rem .9rem;background:rgba(139,105,20,.07);border:1px solid rgba(139,105,20,.2);border-radius:2px;font-size:.75rem;margin-bottom:.9rem}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.sync-bar .zdot-idle{animation:pulse 1.8s infinite}

/* ── ALERTS ── */
.al{padding:10px 14px;border-radius:2px;font-size:.8rem;margin-bottom:.85rem;border:1px solid;font-family:'Barlow',sans-serif}
.al-ok{background:var(--ok-bg);border-color:rgba(26,110,58,.2);color:var(--ok)}
.al-err{background:var(--red-bg);border-color:var(--red-border);color:var(--red)}
.al-info{background:rgba(139,105,20,.07);border-color:rgba(139,105,20,.2);color:var(--warn)}

/* ── FREIGHT DAY BANNER ── */
.freight-banner{background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:1rem 1.2rem;margin-bottom:1rem}
.freight-title{font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--red);margin-bottom:.5rem}
.freight-days{display:flex;gap:1rem;flex-wrap:wrap}
.freight-day{display:flex;align-items:center;gap:.4rem;font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--tx)}
.freight-day span{color:var(--red)}

/* ── URGENCY SELECT ── */
.urgency-opts{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:.4rem}
.urgency-opt{padding:.9rem 1rem;border:2px solid var(--b1);border-radius:2px;cursor:pointer;transition:all .13s;background:#fff;text-align:center}
.urgency-opt.on{border-color:var(--red);background:var(--red-bg)}
.urgency-opt strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--tx);margin-bottom:2px}
.urgency-opt span{font-size:.72rem;color:var(--mu)}
.urgency-opt.on strong{color:var(--red)}

/* ── ADDRESS LOOKUP ── */
.addr-lookup{position:relative}
.addr-lookup input{width:100%;background:#fff;border:1px solid var(--b1);border-radius:2px;padding:10px 12px 10px 36px;color:var(--tx);font-family:'Barlow',sans-serif;font-size:.86rem;transition:border-color .13s}
.addr-lookup input:focus{outline:none;border-color:var(--red);box-shadow:0 0 0 3px var(--red-border)}
.addr-lookup-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:.9rem;pointer-events:none;color:var(--mu)}
.addr-lookup-spin{position:absolute;right:10px;top:50%;transform:translateY(-50%)}
.addr-dropdown{position:absolute;top:calc(100% + 3px);left:0;right:0;background:#fff;border:1px solid var(--b1);border-top:2px solid var(--red);border-radius:0 0 2px 2px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:200;max-height:220px;overflow-y:auto}
.addr-option{padding:10px 13px;cursor:pointer;border-bottom:1px solid var(--cream2);transition:background .11s;font-size:.83rem}
.addr-option:last-child{border-bottom:none}
.addr-option:hover{background:var(--cream2)}
.addr-option strong{display:block;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.88rem;text-transform:uppercase;letter-spacing:.3px;color:var(--tx)}
.addr-option span{font-size:.72rem;color:var(--mu)}
.addr-selected{background:var(--cream2);border:1px solid var(--b1);border-left:3px solid var(--red);border-radius:2px;padding:.6rem .9rem;font-size:.83rem;display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem}
.addr-selected-text{flex:1}
.addr-selected-text strong{display:block;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.88rem;text-transform:uppercase;letter-spacing:.3px;color:var(--tx);margin-bottom:1px}
.addr-selected-text span{font-size:.72rem;color:var(--mu)}
.addr-change{background:none;border:none;color:var(--red);cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-decoration:underline;flex-shrink:0}

/* ── MISC ── */
.dvd{border:none;border-top:1px solid var(--b1);margin:1.1rem 0}
.empty{text-align:center;padding:2.5rem;color:var(--mu);font-size:.85rem;font-style:italic}
.empty .ico{font-size:2.2rem;margin-bottom:.7rem}
.spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(208,16,58,.25);border-top-color:var(--red);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.chk-i{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--b1);border-radius:2px;margin-bottom:5px;background:var(--cream2);cursor:pointer;transition:all .12s}
.chk-i.on{border-color:var(--red);background:var(--red-bg)}
.chk-i input{accent-color:var(--red);width:15px;height:15px;flex-shrink:0}
.ci-info{flex:1}
.ci-info strong{display:block;font-family:'Barlow Condensed',sans-serif;font-size:.88rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--tx)}
.ci-info span{font-size:.72rem;color:var(--mu)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.9rem}
.meta-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;font-size:.72rem;color:var(--mu);margin-top:2px}
.meta-row .tag{background:var(--cream2);border:1px solid var(--b1);border-radius:2px;padding:1px 7px;font-family:'Barlow Condensed',sans-serif;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mu)}
.tag-asap{background:var(--red-bg);border-color:var(--red-border);color:var(--red)}
@media(max-width:700px){
  .stats{grid-template-columns:1fr 1fr}
  .fr,.g2,.g3{grid-template-columns:1fr}
  .aw{grid-template-columns:1fr}
  .ntabs{display:none}
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [user, setUser] = useState(null);
  const [tab,  setTab]  = useState("dashboard");
  const [ready, setReady] = useState(false);
  const [, setStoreVersion] = useState(0);
  const login  = (u) => { setUser(u); setTab("dashboard"); };
  const logout = ()  => setUser(null);

  useEffect(() => {
    let alive = true;
    loadLiveStore().finally(() => alive && setReady(true));
    return subscribeStore(() => setStoreVersion(v => v + 1));
  }, []);

  const TABS = {
    client: [["dashboard","Dashboard"],["orders","My Orders"],["neworder","New Order"],["vendors","Vendors"],["profile","Profile"]],
    driver: [["dashboard","Today's Run"],["signoff","Sign-Off"],["pricing","Pricing"]],
    admin:  [["dashboard","Overview"],["clients","Clients & Invoices"],["orders","All Orders"],["zoho","Zoho"]],
  };

  if (!ready) return <><style>{CSS}</style><div className="auth-wrap"><div className="auth-card"><div className="auth-logo">MOTO<em>&</em>CO</div><div className="auth-sub">Loading live workspace...</div></div></div></>;
  if (!user) return <><style>{CSS}</style><AuthScreen onLogin={login}/></>;
  const tabs = TABS[user.role] || [];

  return (
    <div className="app">
      <style>{CSS}</style>
      <nav className="nav">
        <div className="logo">
          <div className="logo-top">moto&amp;co</div>
          <div className="logo-main">COURIERS</div>
          <div className="logo-sub">NOT JUST COURIERS. PARTS PEOPLE.</div>
        </div>
        <div className="ntabs">
          {tabs.map(([id,lbl]) => <button key={id} className={`nt${tab===id?" on":""}`} onClick={()=>setTab(id)}>{lbl}</button>)}
        </div>
        <div className="nav-r">
          <div className="nav-nm"><strong>{user.businessName||user.name}</strong><span>{user.role}</span></div>
          <span className="rpill">{user.role}</span>
          <button className="btn-out" onClick={logout}>Logout</button>
        </div>
      </nav>

      <main className={`main${user.role==="admin"?" wide":""}`}>
        {user.role==="client" && <>
          {tab==="dashboard" && <ClientDash user={user} setTab={setTab}/>}
          {tab==="orders"    && <ClientOrders user={user}/>}
          {tab==="neworder"  && <NewOrder user={user} setTab={setTab}/>}
          {tab==="vendors"   && <VendorDir/>}
          {tab==="profile"   && <ClientProfile user={user} setUser={setUser}/>}
        </>}
        {user.role==="driver" && <>
          {tab==="dashboard" && <DriverRun user={user} setTab={setTab}/>}
          {tab==="signoff"   && <DriverSignoff user={user}/>}
          {tab==="pricing"   && <PricingSheet/>}
        </>}
        {user.role==="admin" && <>
          {tab==="dashboard" && <AdminDash/>}
          {tab==="clients"   && <AdminClients/>}
          {tab==="orders"    && <AdminOrders/>}
          {tab==="zoho"      && <ZohoSync/>}
        </>}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

function AuthScreen({ onLogin }) {
  const [role, setRole] = useState("client");
  const [mode, setMode] = useState("login");
  return (
    <div className="auth-wrap">
      <div className="auth-stripe"/>
      <div className="auth-card">
        <div className="auth-logo-wrap">
          <div className="auth-logo">MOTO<em>&</em>CO</div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".85rem",fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"var(--red)",marginTop:".1rem"}}>COURIERS</div>
        </div>
        <div className="auth-tagline">Not just couriers. Parts people.</div>
        <div className="auth-sub">Logistics Portal</div>
        <div className="rtabs">
          {[["client","Client"],["driver","Driver"],["admin","Admin"]].map(([r,l]) =>
            <button key={r} className={`rtab${role===r?" on":""}`} onClick={()=>{setRole(r);setMode("login")}}>{l}</button>
          )}
        </div>
        {role==="client"
          ? mode==="login" ? <LoginForm role="client" onLogin={onLogin} onSwitch={()=>setMode("register")}/>
          :                  <RegisterForm onLogin={onLogin} onSwitch={()=>setMode("login")}/>
          :                  <LoginForm role={role} onLogin={onLogin}/>
        }
      </div>
    </div>
  );
}

function LoginForm({ role, onLogin, onSwitch }) {
  const [email,setEmail]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async()=>{
    setBusy(true); setErr("");
    try {
      const r = await apiJSON("/auth/login", { method:"POST", body:JSON.stringify({ role, email }) });
      await loadLiveStore();
      onLogin(r.user);
    } catch(e) {
      setErr(e.message || "No matching account found.");
    }
    setBusy(false);
  };
  return (
    <div>
      {err&&<div className="al al-err">{err}</div>}
      <div className="f"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@workshop.com.au"/></div>
      <button className="btn b-red" onClick={submit} disabled={busy}>{busy?<><span className="spin"/>Signing in...</>:"Login"}</button>
      <div className="al al-info" style={{fontSize:".76rem",marginTop:".8rem"}}>Live build note: authentication is routed through the server. Connect Zoho or portal auth before public launch.</div>
      {role==="client"&&onSwitch&&<p style={{textAlign:"center",marginTop:".9rem",fontFamily:"'Barlow Condensed',sans-serif",fontSize:".82rem",color:"var(--mu)",textTransform:"uppercase",letterSpacing:".5px"}}>No account? <button onClick={onSwitch} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:".82rem",fontWeight:700,textDecoration:"underline",textTransform:"uppercase"}}>Register</button></p>}
    </div>
  );
}

function AddressLookup({ value, onChange, placeholder }) {
  const [query,   setQuery]   = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [selected,setSelected]= useState(value ? { display:value } : null);
  const debounce  = useRef(null);
  const wrapRef   = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = (q) => {
    setQuery(q);
    setSelected(null);
    onChange("");
    clearTimeout(debounce.current);
    if (q.length < 3) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q+", Queensland, Australia")}&format=json&addressdetails=1&limit=6&countrycodes=au`;
        const res = await fetch(url, { headers: { "Accept-Language": "en-AU", "User-Agent": "MotoCoLogistics/1.0" } });
        const data = await res.json();
        // Filter to relevant address types and format nicely
        const filtered = data.filter(r => r.type !== "country" && r.type !== "state").map(r => {
          const a = r.address;
          const street = [a.house_number, a.road].filter(Boolean).join(" ");
          const suburb = a.suburb || a.neighbourhood || a.city_district || "";
          const state  = a.state_code || a.state || "QLD";
          const pcode  = a.postcode || "";
          const full   = [street, suburb, state, pcode].filter(Boolean).join(", ");
          return { display: full || r.display_name.split(",").slice(0,3).join(",").trim(), raw: r };
        }).filter(r => r.display.length > 5);
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 400);
  };

  const pick = (item) => {
    setSelected(item);
    setQuery(item.display);
    setOpen(false);
    onChange(item.display);
  };

  const clear = () => {
    setSelected(null);
    setQuery("");
    onChange("");
    setResults([]);
  };

  return (
    <div ref={wrapRef}>
      {selected ? (
        <div className="addr-selected">
          <div className="addr-selected-text">
            <strong>📍 Address Confirmed</strong>
            <span>{selected.display}</span>
          </div>
          <button className="addr-change" onClick={clear}>Change</button>
        </div>
      ) : (
        <div className="addr-lookup">
          <span className="addr-lookup-icon">📍</span>
          <input
            type="text"
            value={query}
            onChange={e => search(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder || "Start typing address…"}
            autoComplete="off"
          />
          {loading && <span className="addr-lookup-spin"><span className="spin"/></span>}
          {open && results.length > 0 && (
            <div className="addr-dropdown">
              {results.map((r, i) => {
                const parts = r.display.split(",");
                return (
                  <div key={i} className="addr-option" onClick={() => pick(r)}>
                    <strong>{parts[0]}</strong>
                    <span>{parts.slice(1).join(",").trim()}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && query.length >= 3 && results.length === 0 && open === false && (
            <div className="addr-dropdown">
              <div className="addr-option" style={{color:"var(--mu)",cursor:"default"}}>
                <span>No results found — try a suburb or street name</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterForm({ onLogin, onSwitch }) {
  const [f,setF]=useState({name:"",businessName:"",email:"",phone:"",deliveryAddress:"",vendors:[]});
  const [err,setErr]=useState(""); const [busy,setBusy]=useState(false); const [zMsg,setZMsg]=useState("");
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const tog=(v)=>set("vendors",f.vendors.includes(v)?f.vendors.filter(x=>x!==v):[...f.vendors,v]);
  const submit=async()=>{
    if(!f.name||!f.email||!f.businessName){setErr("Fill all required fields.");return;}
    const s=gs(); if(s.clients.find(c=>c.email===f.email)){setErr("Email already registered.");return;}
    setBusy(true);
    const client={...f,id:`c_${Date.now()}`,role:"client",createdAt:new Date().toISOString()};
    mut(g=>g.clients.push(client));
    setZMsg("Syncing to Zoho CRM…");
    await zohoCRMSync(client);
    setZMsg("✓ Synced to Zoho CRM");
    setBusy(false); setTimeout(()=>onLogin(client),900);
  };
  return (
    <div>
      {err&&<div className="al al-err">{err}</div>}
      {zMsg&&<div className="al al-info">{zMsg}</div>}
      <div className="fr">
        <div className="f"><label>Full Name *</label><input value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Jane Smith"/></div>
        <div className="f"><label>Workshop / Business *</label><input value={f.businessName} onChange={e=>set("businessName",e.target.value)} placeholder="Smith Powersports"/></div>
      </div>
      <div className="fr">
        <div className="f"><label>Email *</label><input type="email" value={f.email} onChange={e=>set("email",e.target.value)}/></div>
        <div className="f"><label>Phone</label><input value={f.phone} onChange={e=>set("phone",e.target.value)} placeholder="+61 4xx xxx xxx"/></div>
      </div>
      <div className="al al-info" style={{fontSize:".76rem"}}>Passwords are not stored in this live-ready build. Use Zoho portal authentication before public launch.</div>
      <div className="f">
        <label>Workshop Delivery Address (Gold Coast) *</label>
        <AddressLookup
          value={f.deliveryAddress}
          onChange={v=>set("deliveryAddress",v)}
          placeholder="Start typing your workshop address…"
        />
        <div style={{fontSize:".68rem",color:"var(--mu)",marginTop:4}}>Search and select your Gold Coast workshop address from the dropdown.</div>
      </div>
      <hr className="dvd"/>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".75rem",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--mu)",marginBottom:".5rem"}}>Vendors You Order From</div>
      <div className="vgrid" style={{marginBottom:"1.2rem"}}>
        {Object.keys(VENDORS).map(v=><label key={v} className={`vck${f.vendors.includes(v)?" on":""}`}><input type="checkbox" checked={f.vendors.includes(v)} onChange={()=>tog(v)}/><span>{v}</span></label>)}
      </div>
      <button className="btn b-red" onClick={submit} disabled={busy}>{busy?<><span className="spin"/>Creating Account…</>:"Create Account"}</button>
      <p style={{textAlign:"center",marginTop:".8rem",fontFamily:"'Barlow Condensed',sans-serif",fontSize:".82rem",color:"var(--mu)",textTransform:"uppercase",letterSpacing:".5px"}}>Have an account? <button onClick={onSwitch} style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:".82rem",fontWeight:700,textDecoration:"underline",textTransform:"uppercase"}}>Login</button></p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

function ClientDash({ user, setTab }) {
  const s=gs(); const mine=s.orders.filter(o=>o.clientId===user.id);
  const asap=mine.filter(o=>o.urgency==="asap"&&o.status==="Pending").length;
  return (
    <div>
      <div className="sh">
        <div><div className="sh-t">G'DAY, <span>{user.name.split(" ")[0].toUpperCase()}</span></div><div className="sh-d">{user.businessName} · Gold Coast Delivery Client</div></div>
        <button className="btn b-red b-i" onClick={()=>setTab("neworder")}>+ Place Order</button>
      </div>
      <div className="freight-banner">
        <div className="freight-title">🚐 Structured Freight Days</div>
        <div className="freight-days">
          <div className="freight-day">↗ Order Mon <span>→ Delivered Tue</span></div>
          <div className="freight-day">↗ Order Wed <span>→ Delivered Thu</span></div>
        </div>
        <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:".4rem"}}>Place orders before 12pm for same-day dispatch cycle.</div>
      </div>
      <div className="stats">
        <div className="stat"><div className="sn" style={{color:"var(--red)"}}>{mine.length}</div><div className="sl">Total Orders</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--red)"}}>{mine.filter(o=>o.status==="Pending").length}</div><div className="sl">Pending</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--warn)"}}>{mine.filter(o=>o.status==="In Transit").length}</div><div className="sl">In Transit</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--ok)"}}>{mine.filter(o=>o.status==="Delivered").length}</div><div className="sl">Delivered</div></div>
      </div>
      {asap>0&&<div className="al al-err" style={{display:"flex",alignItems:"center",gap:".5rem"}}>🔴 You have <strong>{asap} ASAP order{asap>1?"s":""}</strong> awaiting pickup.</div>}
      <div className="card">
        <div className="ct">Recent Orders</div>
        {mine.length===0?<div className="empty"><div className="ico">📦</div>No orders yet — place your first one!</div>
          :[...mine].reverse().slice(0,4).map(o=><ORow key={o.id} o={o}/>)}
      </div>
    </div>
  );
}

function ClientOrders({ user }) {
  const mine=[...gs().orders.filter(o=>o.clientId===user.id)].reverse();
  return (
    <div>
      <div className="sh"><div><div className="sh-t">My <span>Orders</span></div><div className="sh-d">{mine.length} total orders</div></div></div>
      {mine.length===0?<div className="card"><div className="empty"><div className="ico">📦</div>No orders yet.</div></div>:mine.map(o=><ORow key={o.id} o={o}/>)}
    </div>
  );
}

function NewOrder({ user, setTab }) {
  const now = new Date();
  const localDate = now.toISOString().slice(0,10);
  const localTime = now.toTimeString().slice(0,5);

  const [f,setF]=useState({conNote:"",vendor:"",notes:"",urgency:"next-run",preferredDate:localDate,preferredTime:localTime});
  const [err,setErr]=useState(""); const [ok,setOk]=useState(false); const [busy,setBusy]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const vOpts=user.vendors?.length?user.vendors:Object.keys(VENDORS);
  const dropAddr=user.deliveryAddress||"(No address — update your profile)";

  const submit=async()=>{
    if(!f.conNote||!f.vendor){setErr("Con note number and vendor are required.");return;}
    setBusy(true);
    const order={...f,dropLocation:dropAddr,id:`o_${Date.now()}`,clientId:user.id,clientName:user.name,
      businessName:user.businessName,clientEmail:user.email,clientPhone:user.phone||"",
      status:"Pending",submittedAt:new Date().toISOString()};
    mut(g=>g.orders.push(order));
    setOk(true); setBusy(false);
    setTimeout(()=>setTab("orders"),1400);
  };

  if(ok) return (<div className="card" style={{textAlign:"center",padding:"3rem"}}><div style={{fontSize:"3rem",marginBottom:"1rem"}}>✅</div><div className="sh-t">Order <span>Placed</span></div><p style={{color:"var(--mu)",marginTop:".5rem",fontStyle:"italic"}}>We'll collect from your supplier on the next freight day.</p></div>);

  return (
    <div>
      <div className="sh"><div><div className="sh-t">Place <span>Order</span></div><div className="sh-d">We collect from Brisbane — delivered to your Gold Coast workshop</div></div></div>
      <div className="card">
        {err&&<div className="al al-err">{err}</div>}
        <div className="f"><label>Con Note Number *</label><input value={f.conNote} onChange={e=>set("conNote",e.target.value)} placeholder="e.g. LI-2024-00482"/></div>
        <div className="f"><label>Vendor / Supplier *</label>
          <select value={f.vendor} onChange={e=>set("vendor",e.target.value)}>
            <option value="">— Select Vendor —</option>
            {vOpts.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="f">
          <label>Delivery Address</label>
          <div style={{background:"var(--cream2)",border:"1px solid var(--b1)",borderLeft:"3px solid var(--red)",borderRadius:2,padding:"10px 12px",fontSize:".86rem",color:"var(--tx)"}}>
            📍 {dropAddr}
          </div>
          <div style={{fontSize:".68rem",color:"var(--mu)",marginTop:4}}>From your profile. Update in the Profile tab if needed.</div>
        </div>
        <hr className="dvd"/>
        <div className="f">
          <label>Delivery Priority</label>
          <div className="urgency-opts">
            <div className={`urgency-opt${f.urgency==="asap"?" on":""}`} onClick={()=>set("urgency","asap")}>
              <strong>🔴 ASAP</strong>
              <span>Next available freight day — priority handling</span>
            </div>
            <div className={`urgency-opt${f.urgency==="next-run"?" on":""}`} onClick={()=>set("urgency","next-run")}>
              <strong>🟢 Next Run</strong>
              <span>Hold until driver heads this way — no rush</span>
            </div>
          </div>
        </div>
        <div className="fr">
          <div className="f"><label>Date Submitted</label><input type="date" value={f.preferredDate} onChange={e=>set("preferredDate",e.target.value)}/></div>
          <div className="f"><label>Time Submitted</label><input type="time" value={f.preferredTime} onChange={e=>set("preferredTime",e.target.value)}/></div>
        </div>
        <div className="f"><label>Notes / Special Instructions</label><textarea value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="Fragile parts, call before delivery, access instructions…"/></div>
        <div style={{display:"flex",gap:"8px"}}>
          <button className="btn b-ghost b-i" onClick={()=>setTab("orders")}>Cancel</button>
          <button className="btn b-red" onClick={submit} disabled={busy}>{busy?<><span className="spin"/>Placing Order…</>:"Place Order"}</button>
        </div>
      </div>
    </div>
  );
}

function ClientProfile({ user, setUser }) {
  const [f,setF]=useState({...user}); const [edit,setEdit]=useState(false); const [saved,setSaved]=useState(false); const [busy,setBusy]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const tog=(v)=>set("vendors",(f.vendors||[]).includes(v)?f.vendors.filter(x=>x!==v):[...(f.vendors||[]),v]);
  const save=async()=>{setBusy(true);mut(g=>{g.clients=g.clients.map(c=>c.id===user.id?f:c);});await zohoCRMSync(f);setUser(f);setEdit(false);setSaved(true);setBusy(false);setTimeout(()=>setSaved(false),2500);};
  return (
    <div>
      <div className="sh"><div><div className="sh-t">My <span>Profile</span></div><div className="sh-d">Workshop details and delivery preferences</div></div></div>
      {saved&&<div className="al al-ok">✓ Saved and synced to Zoho CRM</div>}
      <div className="card">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <div className="ct" style={{margin:0}}>Account Details</div>
          {!edit&&<button className="btn b-cream b-sm" onClick={()=>setEdit(true)}>Edit</button>}
        </div>
        {edit?(
          <div>
            <div className="fr">
              <div className="f"><label>Full Name</label><input value={f.name||""} onChange={e=>set("name",e.target.value)}/></div>
              <div className="f"><label>Workshop / Business</label><input value={f.businessName||""} onChange={e=>set("businessName",e.target.value)}/></div>
            </div>
            <div className="fr">
              <div className="f"><label>Email</label><input value={f.email||""} onChange={e=>set("email",e.target.value)}/></div>
              <div className="f"><label>Phone</label><input value={f.phone||""} onChange={e=>set("phone",e.target.value)}/></div>
            </div>
            <div className="f"><label>Delivery Address (Gold Coast)</label>
              <AddressLookup
                value={f.deliveryAddress||""}
                onChange={v=>set("deliveryAddress",v)}
                placeholder="Search your workshop address…"
              />
            </div>
            <hr className="dvd"/>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".75rem",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--mu)",marginBottom:".5rem"}}>Vendors</div>
            <div className="vgrid" style={{marginBottom:"1.1rem"}}>
              {Object.keys(VENDORS).map(v=><label key={v} className={`vck${(f.vendors||[]).includes(v)?" on":""}`}><input type="checkbox" checked={(f.vendors||[]).includes(v)} onChange={()=>tog(v)}/><span>{v}</span></label>)}
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button className="btn b-ghost b-i" onClick={()=>setEdit(false)}>Cancel</button>
              <button className="btn b-red" onClick={save} disabled={busy}>{busy?<><span className="spin"/>Saving…</>:"Save Changes"}</button>
            </div>
          </div>
        ):(
          <div className="g2">
            {[["Full Name","name"],["Workshop","businessName"],["Email","email"],["Phone","phone"],["Delivery Address","deliveryAddress"]].map(([l,k])=>(
              <div key={k} style={{gridColumn:k==="deliveryAddress"?"1/-1":"auto"}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".68rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--mu)",marginBottom:2}}>{l}</div>
                <div style={{fontSize:".85rem"}}>{user[k]||"—"}</div>
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".68rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--mu)",marginBottom:2}}>Vendors</div>
              <div style={{fontSize:".85rem"}}>{(user.vendors||[]).join(", ")||"None selected"}</div>
            </div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="ct">Pricing Reference</div>
        <p style={{fontSize:".8rem",color:"var(--mu)",marginBottom:"1rem"}}>No contracts. No minimum volumes. Just clear per-package rates (ex GST).</p>
        <div className="pr-section">
          <div className="pr-head">Tyres</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {TYRE_PRICING.map((p,i)=><div key={i} className="pr-row"><div><div className="pr-label">{p.label}</div></div><div className="pr-price">{p.price?`$${p.price.toFixed(2)}`:p.perItem?`$${p.perItem.toFixed(2)} each`:""}</div></div>)}
          </div>
        </div>
        <div className="pr-section">
          <div className="pr-head">Parts</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {PARTS_PRICING.map(p=><div key={p.key} className="pr-row"><div><div className="pr-label">{p.label}</div>{p.note&&<div className="pr-note">{p.note}</div>}</div><div className="pr-price">{p.price?`$${p.price.toFixed(2)}`:"Approval"}</div></div>)}
          </div>
        </div>
        <div className="pr-section">
          <div className="pr-head">Additional</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {ADDITIONAL_PRICING.map(p=><div key={p.label} className="pr-row"><div><div className="pr-label">{p.label}</div><div className="pr-note">{p.note}</div></div><div className="pr-price">{p.price?`+$${p.price.toFixed(2)}`:"Approval"}</div></div>)}
          </div>
        </div>
        <div className="al al-info" style={{marginTop:".3rem"}}>All prices exclude GST (10%). GST applied on monthly invoices.</div>
      </div>
    </div>
  );
}

function VendorDir() {
  return (
    <div>
      <div className="sh"><div><div className="sh-t">Vendor <span>Directory</span></div><div className="sh-d">Our Brisbane supplier network — we collect so you don't have to</div></div></div>
      <div className="g2">
        {Object.entries(VENDORS).map(([name,info])=>(
          <div key={name} className="card" style={{margin:0,transition:"all .13s",borderTop:"3px solid var(--b1)"}} onMouseEnter={e=>e.currentTarget.style.borderTopColor="var(--red)"} onMouseLeave={e=>e.currentTarget.style.borderTopColor="var(--b1)"}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:"1rem",letterSpacing:".5px",textTransform:"uppercase",marginBottom:".5rem",color:"var(--red)"}}>{name}</div>
            <div style={{fontSize:".75rem",color:"var(--mu)",lineHeight:2}}>
              📍 {info.address}<br/>
              📞 <a href={`tel:${info.phone}`} style={{color:"var(--red)",textDecoration:"none",fontWeight:600}}>{info.phone}</a><br/>
              ✉️ <a href={`mailto:${info.email}`} style={{color:"var(--red)",textDecoration:"none"}}>{info.email}</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

function DriverRun({ user, setTab }) {
  const [allOrders,setAll]=useState([]);
  const [vendorF,setVendorF]=useState("");
  const [clientF,setClientF]=useState("");
  const refresh=()=>setAll(gs().orders.filter(o=>o.status==="Pending"||o.status==="In Transit"));
  useEffect(refresh,[]);

  const confirmPickup=(id)=>{mut(g=>{const o=g.orders.find(x=>x.id===id);if(o)o.status="In Transit";});refresh();};

  const filtered=allOrders.filter(o=>{
    if(vendorF&&o.vendor!==vendorF) return false;
    if(clientF&&!o.businessName.toLowerCase().includes(clientF.toLowerCase())&&!o.clientName.toLowerCase().includes(clientF.toLowerCase())) return false;
    return true;
  });

  const pending=filtered.filter(o=>o.status==="Pending");
  const inTransit=filtered.filter(o=>o.status==="In Transit");
  const asapCount=allOrders.filter(o=>o.urgency==="asap"&&o.status==="Pending").length;
  const today=new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"});

  return (
    <div>
      <div className="sh">
        <div><div className="sh-t">Today's <span>Run</span></div><div className="sh-d">{today} · {user.name} · Brisbane pickups → Gold Coast drops</div></div>
        <div style={{display:"flex",gap:"7px"}}>
          <div className="stat" style={{padding:".5rem .9rem",margin:0}}><div className="sn" style={{fontSize:"1.4rem",color:"var(--red)"}}>{allOrders.filter(o=>o.status==="Pending").length}</div><div className="sl">Pickup</div></div>
          <div className="stat" style={{padding:".5rem .9rem",margin:0}}><div className="sn" style={{fontSize:"1.4rem",color:"var(--warn)"}}>{allOrders.filter(o=>o.status==="In Transit").length}</div><div className="sl">En Route</div></div>
        </div>
      </div>

      {asapCount>0&&<div className="al al-err">🔴 <strong>{asapCount} ASAP order{asapCount>1?"s":""}</strong> — priority pickup required.</div>}

      <div className="search-bar">
        <input value={clientF} onChange={e=>setClientF(e.target.value)} placeholder="🔍 Search client or workshop…"/>
        <select value={vendorF} onChange={e=>setVendorF(e.target.value)}>
          <option value="">All Vendors</option>
          {Object.keys(VENDORS).map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        {(vendorF||clientF)&&<button className="btn b-cream b-sm" onClick={()=>{setVendorF("");setClientF("");}}>Clear</button>}
      </div>

      {allOrders.length===0&&<div className="card"><div className="empty"><div className="ico">🚐</div>No orders in the queue right now.</div></div>}
      {allOrders.length>0&&filtered.length===0&&<div className="card"><div className="empty"><div className="ico">🔍</div>No orders match your filter.</div></div>}

      {pending.length>0&&<div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".75rem",fontWeight:800,letterSpacing:"2px",textTransform:"uppercase",color:"var(--red)",marginBottom:".55rem"}}>📍 Brisbane Pickups ({pending.length})</div>
        {pending.map(o=><RunCard key={o.id} o={o} picked={false} onPickup={()=>confirmPickup(o.id)} onSignoff={()=>setTab("signoff")}/>)}
      </div>}

      {inTransit.length>0&&<div style={{marginTop:"1.2rem"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".75rem",fontWeight:800,letterSpacing:"2px",textTransform:"uppercase",color:"var(--ok)",marginBottom:".55rem"}}>🚐 En Route — Gold Coast ({inTransit.length})</div>
        {inTransit.map(o=><RunCard key={o.id} o={o} picked={true} onSignoff={()=>setTab("signoff")}/>)}
      </div>}
    </div>
  );
}

function RunCard({ o, picked, onPickup, onSignoff }) {
  const v=VENDORS[o.vendor];
  const isAsap=o.urgency==="asap";
  const submittedAt=o.submittedAt?new Date(o.submittedAt).toLocaleString("en-AU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  return (
    <div className={`runcard${picked?" picked":""}`} style={{borderLeftColor:isAsap&&!picked?"var(--red)":picked?"var(--ok)":"var(--b2)"}}>
      <div className="rc-top">
        <div>
          <div className="rc-con">{o.conNote}</div>
          <div className="rc-vendor">{o.vendor}</div>
          <div className="meta-row">
            {isAsap&&<span className="tag tag-asap">🔴 ASAP</span>}
            {!isAsap&&<span className="tag">Next Run</span>}
            {submittedAt&&<span>Submitted {submittedAt}</span>}
          </div>
        </div>
        <span className={`bdg ${picked?"bd":"bp"}`}>{picked?"En Route":"Pending"}</span>
      </div>
      {!picked&&<div className="rc-body" style={{marginBottom:".4rem"}}>🏭 <strong>Pickup:</strong> {v?.address||"—"} · <a href={`tel:${v?.phone}`} style={{color:"var(--red)",textDecoration:"none"}}>{v?.phone}</a></div>}
      <div className="rc-addr">
        <div className="addr-lbl">📦 Deliver To — Gold Coast</div>
        <div className="addr-business">{o.businessName}</div>
        <div className="addr-street">{o.dropLocation||"Address not set — check client profile"}</div>
        {o.clientPhone&&<div className="addr-phone">📞 {o.clientPhone} · {o.clientName}</div>}
      </div>
      {o.notes&&<div className="rc-body" style={{marginTop:".3rem"}}>📝 <strong>Notes:</strong> {o.notes}</div>}
      <div style={{display:"flex",gap:"7px",marginTop:".8rem"}}>
        {!picked&&<button className="btn b-red b-sm" onClick={onPickup}>✓ Confirm Pickup</button>}
        {picked&&<button className="btn b-ok b-sm" onClick={onSignoff}>→ Sign Off Delivery</button>}
      </div>
    </div>
  );
}

function DriverSignoff({ user }) {
  const [orders,setOrders]=useState([]);
  const [sel,setSel]=useState(null);
  const [tyreQty,setTyreQty]=useState(0);
  const [partQtys,setPartQtys]=useState({});
  const [returnsQty,setReturnsQty]=useState(0);
  const [recvName,setRecvName]=useState(""); const [recvPhone,setRecvPhone]=useState("");
  const [done,setDone]=useState(false); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const canvasRef=useRef(null); const drawing=useRef(false); const hasSig=useRef(false);

  useEffect(()=>setOrders(gs().orders.filter(o=>o.status==="In Transit")),[]);

  const selectOrder=(o)=>{setSel(o);setTyreQty(0);setPartQtys({});setReturnsQty(0);setErr("");setRecvName("");setRecvPhone("");hasSig.current=false;if(canvasRef.current){const c=canvasRef.current;const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);}};

  useEffect(()=>{if(!canvasRef.current)return;const c=canvasRef.current;c.width=c.offsetWidth;c.height=c.offsetHeight;hasSig.current=false;},[sel]);

  const getXY=(e,c)=>{const r=c.getBoundingClientRect();const src=e.touches?e.touches[0]:e;return[src.clientX-r.left,src.clientY-r.top];};
  const startDraw=e=>{drawing.current=true;const c=canvasRef.current;const[x,y]=getXY(e,c);c.getContext("2d").beginPath();c.getContext("2d").moveTo(x,y);};
  const doDraw=e=>{if(!drawing.current)return;e.preventDefault();hasSig.current=true;const c=canvasRef.current;const ctx=c.getContext("2d");const[x,y]=getXY(e,c);ctx.lineTo(x,y);ctx.strokeStyle="#e11d48";ctx.lineWidth=2.5;ctx.lineCap="round";ctx.stroke();};
  const endDraw=()=>{drawing.current=false;};
  const clearSig=()=>{const c=canvasRef.current;if(c)c.getContext("2d").clearRect(0,0,c.width,c.height);hasSig.current=false;};

  const setPartQty=(key,delta)=>setPartQtys(prev=>{const n=Math.max(0,(prev[key]||0)+delta);return{...prev,[key]:n};});

  const tyrePrice=calcTyrePrice(tyreQty);
  const partsTotal=calcPartsTotal(partQtys);
  const returnsTotal=returnsQty*6;
  const grandTotal=tyrePrice+partsTotal+returnsTotal;

  const tyreTier=tyreQty===0?"—":tyreQty===1?"1 Tyre":tyreQty===2?"2 Tyres":tyreQty===3?"3 Tyres":`${tyreQty} Tyres (4+ rate)`;

  const complete=async()=>{
    if(!sel){setErr("Select a package first.");return;}
    if(tyreQty===0&&!Object.values(partQtys).some(q=>q>0)){setErr("Enter at least one tyre or part quantity.");return;}
    if(!recvName.trim()){setErr("Enter receiver name.");return;}
    if(!hasSig.current){setErr("Capture receiver signature.");return;}
    setBusy(true);
    const sig=canvasRef.current?.toDataURL()||"";
    const itemParts=[];
    if(tyreQty>0) itemParts.push(`${tyreQty} tyre(s) — $${tyrePrice.toFixed(2)}`);
    Object.entries(partQtys).filter(([,q])=>q>0).forEach(([k,q])=>{const p=PARTS_PRICING.find(x=>x.key===k);itemParts.push(`${p?.label||k} x${q} — $${(p?.price||0)*q>0?((p?.price||0)*q).toFixed(2):"TBD"}`);});
    if(returnsQty>0) itemParts.push(`${returnsQty} return(s) — $${returnsTotal.toFixed(2)}`);
    const delivery={
      id:`d_${Date.now()}`,orderId:sel.id,conNote:sel.conNote,
      clientName:sel.clientName,businessName:sel.businessName,clientEmail:sel.clientEmail,
      vendor:sel.vendor,dropLocation:sel.dropLocation,
      receiverName:recvName,receiverPhone:recvPhone,
      tyreQty,tyrePrice,partQtys,partsTotal,returnsQty,returnsTotal,
      totalPrice:grandTotal,itemsDesc:itemParts.join("; "),
      driverName:user.name,signatureData:sig,
      completedAt:new Date().toISOString(),
    };
    mut(g=>{g.deliveries.push(delivery);const o=g.orders.find(x=>x.id===sel.id);if(o){o.status="Delivered";o.price=grandTotal;}});
    setOrders(prev=>prev.filter(x=>x.id!==sel.id));
    setSel(null);setTyreQty(0);setPartQtys({});setReturnsQty(0);setRecvName("");setRecvPhone("");clearSig();
    setErr("");setBusy(false);setDone(true);setTimeout(()=>setDone(false),3000);
  };

  return (
    <div>
      <div className="sh"><div><div className="sh-t">Delivery <span>Sign-Off</span></div><div className="sh-d">Select package · log what was delivered · capture signature</div></div></div>
      {done&&<div className="al al-ok">✓ Delivery signed off and completed!</div>}
      {err&&<div className="al al-err">{err}</div>}

      {orders.length===0
        ?<div className="card"><div className="empty"><div className="ico">✅</div>No packages awaiting sign-off right now.</div></div>
        :<div className="card"><div className="ct">Step 1 — Select Package</div>
          {orders.map(o=>(
            <label key={o.id} className={`chk-i${sel?.id===o.id?" on":""}`} onClick={()=>selectOrder(o)}>
              <input type="radio" name="so" checked={sel?.id===o.id} onChange={()=>selectOrder(o)} style={{accentColor:"var(--red)"}}/>
              <div className="ci-info">
                <strong>{o.conNote} — {o.vendor}</strong>
                <span>{o.businessName} · {o.dropLocation||"No address"}</span>
              </div>
              {o.urgency==="asap"&&<span className="tag tag-asap" style={{flexShrink:0}}>ASAP</span>}
            </label>
          ))}
        </div>
      }

      {sel&&<div className="card">
        <div className="ct">Step 2 — What Was Delivered?</div>

        {/* TYRE COUNTER */}
        <div style={{marginBottom:"1.2rem"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".8rem",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--tx)",marginBottom:".6rem"}}>🛞 Total Tyres Delivered</div>
          <div className="tyre-counter">
            <div style={{textAlign:"center"}}>
              <button className="tyre-btn" onClick={()=>setTyreQty(q=>Math.max(0,q-1))} disabled={tyreQty===0}>−</button>
            </div>
            <div style={{textAlign:"center"}}>
              <div className="tyre-num">{tyreQty}</div>
              <div className="tyre-lbl">Tyres</div>
            </div>
            <div style={{textAlign:"center"}}>
              <button className="tyre-btn" onClick={()=>setTyreQty(q=>q+1)}>+</button>
            </div>
          </div>
          {tyreQty>0&&<div style={{background:"var(--cream2)",border:"1px solid var(--b1)",borderLeft:"3px solid var(--red)",borderRadius:2,padding:".7rem 1rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".75rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--mu)"}}>Rate Applied</div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".95rem",fontWeight:700,color:"var(--tx)"}}>{tyreTier}</div></div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.5rem",fontWeight:900,color:"var(--red)"}}>${tyrePrice.toFixed(2)}</div>
          </div>}
        </div>

        {/* PARTS */}
        <div style={{marginBottom:"1.2rem"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".8rem",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--tx)",marginBottom:".6rem"}}>⚙️ Parts Consignments</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {PARTS_PRICING.map(p=>{
              const q=partQtys[p.key]||0;
              const lt=p.price&&q>0?p.price*q:0;
              return(<div key={p.key} className="qty-row">
                <div className="qty-info"><strong>{p.label}</strong><span>{p.price?`$${p.price.toFixed(2)} per consignment`:p.note}</span></div>
                <div className="qty-ctrl">
                  <button className="qty-btn" onClick={()=>setPartQty(p.key,-1)} disabled={q===0}>−</button>
                  <div className="qty-num">{q}</div>
                  <button className="qty-btn" onClick={()=>setPartQty(p.key,1)}>+</button>
                  <div className="qty-price">{lt>0?`$${lt.toFixed(2)}`:p.key==="p3"&&q>0?"TBD":""}</div>
                </div>
              </div>);
            })}
          </div>
        </div>

        {/* RETURNS */}
        <div style={{marginBottom:"1rem"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".8rem",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",color:"var(--tx)",marginBottom:".6rem"}}>↩️ Returns to Supplier</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            <div className="qty-row">
              <div className="qty-info"><strong>Return Packages</strong><span>$6.00 per package (pre-labelled)</span></div>
              <div className="qty-ctrl">
                <button className="qty-btn" onClick={()=>setReturnsQty(q=>Math.max(0,q-1))} disabled={returnsQty===0}>−</button>
                <div className="qty-num">{returnsQty}</div>
                <button className="qty-btn" onClick={()=>setReturnsQty(q=>q+1)}>+</button>
                <div className="qty-price">{returnsQty>0?`$${returnsTotal.toFixed(2)}`:""}</div>
              </div>
            </div>
          </div>
        </div>

        {grandTotal>0&&<div className="total-bar">
          <div><div className="total-bar-lbl">Total Charge</div><div style={{fontSize:".68rem",color:"rgba(242,237,227,.6)",marginTop:2}}>ex GST · ${(grandTotal*1.1).toFixed(2)} inc GST</div></div>
          <div><span className="total-bar-val">${grandTotal.toFixed(2)}</span><span className="total-bar-gst">EX GST</span></div>
        </div>}
      </div>}

      {sel&&(tyreQty>0||Object.values(partQtys).some(q=>q>0)||returnsQty>0)&&<div className="card">
        <div className="ct">Step 3 — Receiver Sign-Off</div>
        <div className="so-wrap">
          <div className="g2" style={{marginBottom:"1rem"}}>
            {[["Client",sel.businessName],["Con Note",sel.conNote],["Deliver To",sel.dropLocation||"—"],["Total (ex GST)",`$${grandTotal.toFixed(2)}`]].map(([l,v],i)=>(
              <div key={l}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".65rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--mu)",marginBottom:2}}>{l}</div>
              <div style={{fontSize:".88rem",fontWeight:i===3?800:400,color:i===3?"var(--red)":"var(--tx)",fontFamily:i===3?"'Barlow Condensed',sans-serif":"inherit"}}>{v}</div></div>
            ))}
          </div>
          <hr className="dvd"/>
          <div className="fr">
            <div className="f"><label>Receiver Name *</label><input value={recvName} onChange={e=>setRecvName(e.target.value)} placeholder="Full name"/></div>
            <div className="f"><label>Receiver Phone</label><input value={recvPhone} onChange={e=>setRecvPhone(e.target.value)} placeholder="+61 4xx xxx xxx"/></div>
          </div>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".7rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--mu)",marginBottom:".4rem"}}>Receiver Signature *</div>
          <div className="sigbox" onMouseDown={startDraw} onMouseMove={doDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={doDraw} onTouchEnd={endDraw}>
            <canvas ref={canvasRef} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>
            <div className="sigph">Sign here with mouse or finger</div>
            <button className="sigclr" onClick={clearSig}>Clear</button>
          </div>
          <div style={{marginTop:".9rem"}}>
            <button className="btn b-ok" onClick={complete} disabled={busy}>{busy?<><span className="spin"/>Completing…</>:"✓ Complete Delivery & Sign Off"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function PricingSheet() {
  return (
    <div>
      <div className="sh"><div><div className="sh-t">Pricing <span>Reference</span></div><div className="sh-d">Simple. Transparent. No contracts, no minimum volumes.</div></div></div>
      <div className="card">
        <div style={{background:"var(--red)",color:"#f3f3e8",borderRadius:2,padding:"1.2rem 1.4rem",marginBottom:"1.2rem"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.3rem",fontWeight:900,letterSpacing:"1px",textTransform:"uppercase",marginBottom:".3rem"}}>SIMPLE, TRANSPARENT PRICING</div>
          <div style={{fontSize:".82rem",opacity:.85}}>No contracts. No minimum volumes. Just clear per-package rates.</div>
        </div>
        <div className="pr-section">
          <div className="pr-head">Tyres</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {TYRE_PRICING.map((p,i)=><div key={i} className="pr-row"><div className="pr-label">{p.label}</div><div className="pr-price">{p.price?`$${p.price.toFixed(2)}`:p.perItem?`$${p.perItem.toFixed(2)} each`:""}</div></div>)}
          </div>
        </div>
        <div className="pr-section">
          <div className="pr-head">Parts</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {PARTS_PRICING.map(p=><div key={p.key} className="pr-row"><div><div className="pr-label">{p.label}</div>{p.note&&<div className="pr-note">{p.note}</div>}</div><div className="pr-price">{p.price?`$${p.price.toFixed(2)}`:"Approval"}</div></div>)}
          </div>
        </div>
        <div className="pr-section">
          <div className="pr-head">Additional</div>
          <div style={{background:"var(--cream2)",borderRadius:2,overflow:"hidden",border:"1px solid var(--b1)"}}>
            {ADDITIONAL_PRICING.map(p=><div key={p.label} className="pr-row"><div><div className="pr-label">{p.label}</div><div className="pr-note">{p.note}</div></div><div className="pr-price">{p.price?`+$${p.price.toFixed(2)}`:"Approval"}</div></div>)}
          </div>
        </div>
        <div className="al al-info">All prices exclude GST. GST applied on monthly invoices.</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

function AdminDash() {
  const s=gs(); const now=new Date();
  const thisM=s.deliveries.filter(d=>new Date(d.completedAt).getMonth()===now.getMonth());
  const rev=thisM.reduce((sum,d)=>sum+(d.totalPrice||0),0);
  return (
    <div>
      <div className="sh"><div><div className="sh-t">Admin <span>Overview</span></div><div className="sh-d">moto&amp;co couriers · Super Admin</div></div></div>
      <div className="stats">
        <div className="stat"><div className="sn" style={{color:"var(--red)"}}>{s.clients.length}</div><div className="sl">Clients</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--red)"}}>{s.orders.filter(o=>o.status==="Pending").length}</div><div className="sl">Pending</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--warn)"}}>{s.deliveries.length}</div><div className="sl">Deliveries</div></div>
        <div className="stat"><div className="sn" style={{color:"var(--ok)"}}>${rev.toFixed(0)}</div><div className="sl">This Month</div></div>
      </div>
      <div className="g2">
        <div className="card"><div className="ct">Latest Orders</div>{[...s.orders].reverse().slice(0,5).map(o=><ORow key={o.id} o={o} showClient/>)}{!s.orders.length&&<div className="empty">No orders yet.</div>}</div>
        <div className="card">
          <div className="ct">Latest Sign-Offs</div>
          {[...s.deliveries].reverse().slice(0,5).map(d=>(
            <div key={d.id} style={{padding:".7rem 0",borderBottom:"1px solid var(--cream2)",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem"}}>
              <div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".88rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".3px",color:"var(--tx)"}}>{d.businessName}</div><div style={{fontSize:".7rem",color:"var(--mu)"}}>{d.conNote} · {d.itemsDesc||""} · signed {d.receiverName}</div></div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1rem",fontWeight:900,color:"var(--red)",flexShrink:0}}>${(d.totalPrice||0).toFixed(2)}</div>
            </div>
          ))}
          {!s.deliveries.length&&<div className="empty">No deliveries yet.</div>}
        </div>
      </div>
    </div>
  );
}

function AdminClients() {
  const [selId,setSelId]=useState(null); const [month,setMonth]=useState(null);
  const [busy,setBusy]=useState(false); const [invRes,setInvRes]=useState(null);
  const s=gs(); const sel=s.clients.find(c=>c.id===selId);
  const monthSet=new Set(); s.deliveries.forEach(d=>{const m=new Date(d.completedAt).toLocaleString("en-AU",{month:"short",year:"numeric"});monthSet.add(m);});
  const months=[...monthSet];
  const clientDeliveries=sel?s.deliveries.filter(d=>{
    if(d.clientEmail!==sel.email)return false;
    if(month){const m=new Date(d.completedAt).toLocaleString("en-AU",{month:"short",year:"numeric"});return m===month;}
    return true;
  }):[];
  const sub=clientDeliveries.reduce((s,d)=>s+(d.totalPrice||0),0);
  const gst=sub*.1; const tot=sub+gst;
  const mLbl=month||new Date().toLocaleString("en-AU",{month:"long",year:"numeric"});
  const sendInvoice=async()=>{
    if(!sel||!clientDeliveries.length)return;
    setBusy(true);setInvRes(null);
    const r=await zohoBooksInvoice(sel,clientDeliveries,mLbl);
    setBusy(false);
    const p=parseJSON(r.text);
    if(r.ok&&p?.success) setInvRes({ok:true,msg:`✓ Invoice ${p.invoiceNumber||""} created in Zoho Books — sent to ${sel.email}`});
    else setInvRes({ok:false,msg:"Zoho Books error: "+(p?.message||r.error||"Unknown")});
  };
  return (
    <div>
      <div className="sh"><div><div className="sh-t">Clients & <span>Invoices</span></div><div className="sh-d">Per-client delivery history · EOM invoicing via Zoho Books</div></div></div>
      <div className="aw">
        <div className="clist">
          <div className="cl-h">Clients <span style={{color:"var(--red)",fontWeight:900}}>{s.clients.length}</span></div>
          {!s.clients.length&&<div className="empty" style={{padding:"1.3rem"}}>No clients yet.</div>}
          {s.clients.map(c=>(
            <div key={c.id} className={`cl-i${selId===c.id?" on":""}`} onClick={()=>{setSelId(c.id);setInvRes(null);setMonth(null);}}>
              <strong>{c.businessName}</strong><span>{c.name} · {c.email}</span>
            </div>
          ))}
        </div>
        <div>
          {!sel?<div className="card"><div className="empty"><div className="ico">👈</div>Select a client to view their account.</div></div>:<>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:".6rem",marginBottom:"1rem"}}>
                <div><div className="ct" style={{margin:0,marginBottom:".2rem"}}>{sel.businessName}</div><div style={{fontSize:".77rem",color:"var(--mu)"}}>{sel.name} · {sel.email} · {sel.phone||"—"}</div></div>
                <span className="bdg bz">CRM Synced</span>
              </div>
              <div className="g3">
                {[["Delivery Address",sel.deliveryAddress||"—"],["Phone",sel.phone||"—"],["Vendors",(sel.vendors||[]).join(", ")||"—"]].map(([l,v])=>(
                  <div key={l}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".65rem",fontWeight:700,letterSpacing:".8px",textTransform:"uppercase",color:"var(--mu)",marginBottom:2}}>{l}</div><div style={{fontSize:".78rem"}}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".9rem",flexWrap:"wrap",gap:".5rem"}}>
                <div className="ct" style={{margin:0}}>Delivery History</div>
                <div className="mf" style={{margin:0}}>
                  <button className={`mb${!month?" on":""}`} onClick={()=>setMonth(null)}>All Time</button>
                  {months.map(m=><button key={m} className={`mb${month===m?" on":""}`} onClick={()=>setMonth(m)}>{m}</button>)}
                </div>
              </div>
              {!clientDeliveries.length?<div className="empty">No deliveries {month?"in "+month:"found"}.</div>:<>
                {clientDeliveries.map(d=>(
                  <div key={d.id} className="inv-l">
                    <div>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:".88rem",textTransform:"uppercase",letterSpacing:".3px"}}>{d.conNote} — {d.vendor}</div>
                      <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:2}}>{new Date(d.completedAt).toLocaleDateString("en-AU")} · {d.itemsDesc||""}</div>
                      <div style={{fontSize:".7rem",color:"var(--mu)"}}>Signed by {d.receiverName}{d.receiverPhone?` · ${d.receiverPhone}`:""}</div>
                    </div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.1rem",fontWeight:900,color:"var(--red)",flexShrink:0,marginLeft:".5rem"}}>${(d.totalPrice||0).toFixed(2)}</div>
                  </div>
                ))}
                <div className="inv-tot">
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".72rem",color:"var(--mu)",letterSpacing:".5px",textTransform:"uppercase"}}>Subtotal ex GST</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".72rem",color:"var(--mu)",letterSpacing:".5px",textTransform:"uppercase"}}>GST (10%)</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".85rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginTop:".2rem"}}>Total inc GST</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:".75rem",color:"var(--mu)"}}>${sub.toFixed(2)}</div>
                    <div style={{fontSize:".75rem",color:"var(--mu)"}}>${gst.toFixed(2)}</div>
                    <strong>${tot.toFixed(2)}</strong>
                  </div>
                </div>
                <div style={{marginTop:"1rem"}}>
                  {invRes&&<div className={`al ${invRes.ok?"al-ok":"al-err"}`}>{invRes.msg}</div>}
                  <button className="btn b-red" onClick={sendInvoice} disabled={busy||!clientDeliveries.length}>
                    {busy?<><span className="spin"/>Creating Invoice…</>:"📄 Send EOM Invoice via Zoho Books"}
                  </button>
                </div>
              </>}
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

function AdminOrders() {
  const [filter,setFilter]=useState("all");
  const s=gs();
  const orders=[...s.orders].reverse().filter(o=>filter==="all"||o.status===filter||(filter==="asap"&&o.urgency==="asap"));
  return (
    <div>
      <div className="sh">
        <div><div className="sh-t">All <span>Orders</span></div><div className="sh-d">{s.orders.length} total across all clients</div></div>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
          {[["all","All"],["asap","🔴 ASAP"],["Pending","Pending"],["In Transit","In Transit"],["Delivered","Delivered"]].map(([v,l])=>(
            <button key={v} className={`mb${filter===v?" on":""}`} onClick={()=>setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>
      {!orders.length?<div className="card"><div className="empty"><div className="ico">📦</div>No orders found.</div></div>:orders.map(o=><ORow key={o.id} o={o} showClient/>)}
    </div>
  );
}

function ZohoSync() {
  const [status,setStatus]=useState("idle"); const [log,setLog]=useState([]); const [crmData,setCrmData]=useState([]);
  const s=gs();
  const addLog=(msg,type="info")=>setLog(p=>[{msg,type,t:new Date().toLocaleTimeString()},...p].slice(0,20));
  const syncAll=async()=>{setStatus("loading");addLog(`Syncing ${s.clients.length} clients to Zoho CRM…`);for(const c of s.clients){const r=await zohoCRMSync(c);const p=parseJSON(r.text);addLog(`${c.businessName}: ${p?.message||"synced"}`,p?.success!==false?"ok":"err");}setStatus("done");addLog("✓ All clients synced","ok");};
  const fetchCRM=async()=>{setStatus("loading");addLog("Fetching Zoho CRM contacts…");const r=await zohoCRMFetch();const p=parseJSON(r.text);if(Array.isArray(p)){setCrmData(p);addLog(`✓ ${p.length} contacts found`,"ok");}else addLog("Could not parse CRM response","err");setStatus("done");};
  return (
    <div>
      <div className="sh"><div><div className="sh-t">Zoho <span>Integration</span></div><div className="sh-d">CRM · Books · Sync</div></div></div>
      {status==="loading"&&<div className="sync-bar"><span className="zdot zdot-idle"/>Connecting to Zoho MCP servers…</div>}
      <div className="g2">
        <div className="card"><div className="ct">Zoho CRM</div><p style={{fontSize:".8rem",color:"var(--mu)",marginBottom:"1rem"}}>Clients auto-synced on registration. Manual sync pushes all existing clients.</p><div style={{display:"flex",flexDirection:"column",gap:"6px"}}><button className="btn b-red" onClick={syncAll} disabled={status==="loading"}>↑ Sync All Clients to CRM</button><button className="btn b-cream" onClick={fetchCRM} disabled={status==="loading"}>↓ Fetch CRM Contacts</button></div></div>
        <div className="card"><div className="ct">Zoho Books</div><p style={{fontSize:".8rem",color:"var(--mu)",marginBottom:"1rem"}}>EOM invoices created per-client. Includes tyre pricing calculated from total tyre count, parts, and returns.</p><div className="al al-info" style={{fontSize:".78rem"}}>Go to <strong>Clients & Invoices</strong> → select client → Send EOM Invoice</div></div>
      </div>
      <div className="card">
        <div className="ct">Integration Status</div>
        {[["Zoho CRM","Client contact & account sync","Connected"],["Zoho Books","Invoice generation & delivery","Connected"],["Auto-sync on Register","New clients pushed to CRM","Active"]].map(([name,desc,stat])=>(
          <div key={name} className="zoho-row"><div style={{display:"flex",alignItems:"center",gap:9}}><span className={`zdot ${stat==="Connected"||stat==="Active"?"zdot-live":"zdot-idle"}`}/><div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".88rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".3px"}}>{name}</div><div style={{fontSize:".72rem",color:"var(--mu)"}}>{desc}</div></div></div><span className="bdg bz">{stat}</span></div>
        ))}
      </div>
      {crmData.length>0&&<div className="card"><div className="ct">Zoho CRM Contacts ({crmData.length})</div>{crmData.map((c,i)=><div key={i} className="zoho-row"><div><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:".88rem",fontWeight:700,textTransform:"uppercase"}}>{c.name||c.business||"—"}</div><div style={{fontSize:".72rem",color:"var(--mu)"}}>{c.email} · {c.phone||"—"}</div></div><span className="bdg bz">CRM</span></div>)}</div>}
      {log.length>0&&<div className="card"><div className="ct">Sync Log</div><div style={{fontFamily:"monospace",fontSize:".72rem",maxHeight:"200px",overflowY:"auto"}}>{log.map((l,i)=><div key={i} style={{padding:"4px 0",borderBottom:"1px solid var(--cream2)",color:l.type==="ok"?"var(--ok)":l.type==="err"?"var(--red)":"var(--mu)"}}><span style={{color:"var(--mu2)",marginRight:"8px"}}>{l.t}</span>{l.msg}</div>)}</div></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════════════════

function ORow({ o, showClient }) {
  const sc=o.status==="Delivered"?"bd":o.status==="In Transit"?"bt":"bp";
  const dt=o.submittedAt?new Date(o.submittedAt).toLocaleString("en-AU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):new Date(o.id.replace("o_","")>>0).toLocaleDateString("en-AU");
  const cols=showClient?"60px 1fr 1fr auto auto":"60px 1fr auto auto";
  return (
    <div className="orow" style={{gridTemplateColumns:cols,borderLeftColor:o.urgency==="asap"?"var(--red)":"var(--b2)"}}>
      <div className="onum">#{o.id.slice(-4)}</div>
      <div className="oi"><strong>{o.vendor} — {o.conNote}</strong><span>📦 {o.dropLocation||"Gold Coast"}{o.price>0?` · $${o.price.toFixed(2)} ex GST`:""}</span></div>
      {showClient&&<div className="oi"><strong>{o.businessName}</strong><span>{o.clientEmail}</span></div>}
      <div>{o.urgency==="asap"&&<span className="tag tag-asap">ASAP</span>}<span className={`bdg ${sc}`} style={{marginLeft:o.urgency==="asap"?4:0}}>{o.status}</span></div>
      <div className="od">{dt}</div>
    </div>
  );
}
