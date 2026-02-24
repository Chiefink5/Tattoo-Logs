// ================= STATE =================
let entries = JSON.parse(localStorage.getItem("entries") || "[]");
let editingId = null;
let viewingId = null;

let payday = Number(localStorage.getItem("payday") || 0);
let payPeriodAnchor = null;

let splitSettings = JSON.parse(localStorage.getItem("splitSettings") || "null") || {
  defaultPct: 100,
  monthOverrides: {} // { "YYYY-MM": pct }
};

let filters = JSON.parse(localStorage.getItem("filters") || "null") || {
  q: "",
  status: "all",
  location: "all",
  from: "",
  to: "",
  sort: "newest"
};

// Rewards (badge levels + discount tiers)
let rewardsSettings = JSON.parse(localStorage.getItem("rewardsSettings") || "null") || {
  levels: [
    { id: "lvl1", name: "Rookie", minCount: 1, pngDataUrl: "" },
    { id: "lvl2", name: "Regular", minCount: 5, pngDataUrl: "" },
    { id: "lvl3", name: "VIP", minCount: 10, pngDataUrl: "" }
  ],
  discounts: [
    { id: "d1", label: "5% off", minCount: 5, percent: 5 },
    { id: "d2", label: "10% off", minCount: 10, percent: 10 }
  ]
};

// Prefill targets (repeat client)
let prefillClient = null; // { client, contact, social }

// Toast de-dupe
let toastQueue = [];
let toastTimer = null;

// ================= HELPERS =================
function safeEl(id){ return document.getElementById(id); }
function safeVal(id){ const el = safeEl(id); return el ? el.value : ""; }
function pad2(n){ return String(n).padStart(2,"0"); }
function money(n){
  const num = Number(n || 0);
  const v = Number.isFinite(num) ? num : 0;
  return "$" + v.toFixed(2).replace(/\.00$/,"");
}
function monthName(year, monthIndex){
  return new Date(year, monthIndex, 1).toLocaleString("default",{month:"long"});
}
function parseLocalDate(dateStr){
  const parts = String(dateStr || "").split("-");
  if(parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0,0,0,0);
  return dt;
}
function formatYYYYMMDD(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function formatYYYYMM(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}

// ✅ LOCAL “today” key (midnight local, not UTC)
function localTodayKey(){
  const d = new Date();
  return formatYYYYMMDD(d);
}

function clampPct(p){
  p = Number(p);
  if(!Number.isFinite(p)) return 100;
  return Math.max(0, Math.min(100, p));
}
function normalize(s){ return String(s||"").toLowerCase(); }
function uid(prefix="id"){ return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

// ================= FORM VALIDATION UI =================
function clearInvalidMarks(root){
  const scope = root || document;
  scope.querySelectorAll(".field.invalid").forEach(f=> f.classList.remove("invalid"));
  scope.querySelectorAll(".field .field-err").forEach(el=> el.remove());
}
function markInvalid(inputId, message){
  const el = safeEl(inputId);
  if(!el) return;
  const field = el.closest(".field");
  if(!field) return;
  field.classList.add("invalid");
  if(message){
    let m = field.querySelector(".field-err");
    if(!m){
      m = document.createElement("div");
      m.className = "field-err";
      field.appendChild(m);
    }
    m.textContent = message;
  }
}
function scrollToFirstInvalid(root){
  const scope = root || document;
  const first = scope.querySelector(".field.invalid");
  if(first){
    first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function paymentsArray(entry){ return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry){ return paymentsArray(entry).reduce((sum,p)=>sum + Number(p.amount || 0), 0); }
function depositAmount(entry){
  return paymentsArray(entry).filter(p=>p.kind==="deposit").reduce((sum,p)=>sum + Number(p.amount||0), 0);
}
function hasAnyPayments(entry){ return paymentsArray(entry).some(p => Number(p.amount||0) > 0); }
function hasSessions(entry){ return paymentsArray(entry).some(p => p.kind === "session" && Number(p.amount||0) > 0); }
function isDepositOnlyEntry(entry){
  return depositAmount(entry) > 0 && !hasSessions(entry);
}
function isTattooEntry(entry){
  return !isDepositOnlyEntry(entry);
}
function currentQuarterIndex(dateObj){ return Math.floor(dateObj.getMonth() / 3); }

// ---- Totals logic (gross) ----
function totalForTotalsGross(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if(status === "paid") return Number(entry.total || 0);
  if(status === "partial") return paidAmount(entry);
  return 0;
}

// Preview Paid line (what you see on the card)
function paidForPreview(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if(status === "paid") return Number(entry.total || 0);
  if(status === "partial") return paidAmount(entry);
  if(status === "booked") return depositAmount(entry);
  return 0;
}

// ---- Split math (net) ----
function getSplitPctForDate(dateStr){
  const d = parseLocalDate(dateStr);
  if(!d) return clampPct(splitSettings.defaultPct || 100);
  const key = formatYYYYMM(d);
  const override = splitSettings.monthOverrides && splitSettings.monthOverrides[key];
  const pct = (override !== undefined && override !== null)
    ? Number(override)
    : Number(splitSettings.defaultPct || 100);
  return clampPct(pct);
}
function netFromGross(gross, pct){ return Number(gross||0) * (clampPct(pct) / 100); }
function totalForTotalsNet(entry){
  const gross = totalForTotalsGross(entry);
  const pct = getSplitPctForDate(entry.date);
  return netFromGross(gross, pct);
}

// ================= PERSIST =================
function save(){
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}
function saveFilters(){
  localStorage.setItem("filters", JSON.stringify(filters));
}
function saveRewardsSettings(){
  localStorage.setItem("rewardsSettings", JSON.stringify(rewardsSettings));
}

// ================= TOASTS =================
function pushToast(toast){
  toastQueue.push(toast);
  if(!toastTimer) {
    toastTimer = setInterval(flushToast, 250);
  }
}
function flushToast(){
  if(!toastQueue.length){
    clearInterval(toastTimer);
    toastTimer = null;
    return;
  }
  const t = toastQueue.shift();
  showToast(t);
}
function showToast({ title, sub, mini, imgDataUrl, actionLabel, actionFn }){
  const wrap = safeEl("toasts");
  if(!wrap) return;

  const el = document.createElement("div");
  el.className = "toast";

  const img = imgDataUrl ? `<img src="${imgDataUrl}" alt="badge">` : ``;

  el.innerHTML = `
    <div class="t-row">
      ${img}
      <div style="min-width:0;">
        <div class="t-title">${title || "Update"}</div>
        ${sub ? `<div class="t-sub">${sub}</div>` : ``}
        ${mini ? `<div class="t-mini">${mini}</div>` : ``}
      </div>
    </div>
    ${actionLabel ? `<div class="t-actions"><button type="button">${actionLabel}</button></div>` : ``}
  `;

  if(actionLabel && typeof actionFn === "function"){
    const btn = el.querySelector("button");
    btn.addEventListener("click", ()=>{
      actionFn();
      el.remove();
    });
  }

  wrap.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 5500);
}

// ================= MODALS (click off to close) =================
const formModal = safeEl("formModal");
const formBox = safeEl("formBox");
const viewModal = safeEl("viewModal");
const viewBox = safeEl("viewBox");
const exportModal = safeEl("exportModal");
const exportBox = safeEl("exportBox");
const settingsModal = safeEl("settingsModal");
const settingsBox = safeEl("settingsBox");
const rewardsModal = safeEl("rewardsModal");
const rewardsBox = safeEl("rewardsBox");
const clientModal = safeEl("clientModal");
const clientBox = safeEl("clientBox");
const bammerModal = safeEl("bammerModal");
const depositModal = safeEl("depositModal");

[formModal, viewModal, exportModal, settingsModal, rewardsModal, clientModal, bammerModal, depositModal].forEach(modal=>{
  if(!modal) return;
  modal.addEventListener("click", (e)=>{
    if(e.target === modal){
      modal.style.display = "none";
      if(modal === formModal){ resetForm(); editingId = null; }
    }
  });
});

// ================= LOGO =================
(function initLogo(){
  const logoImg = safeEl("logoImg");
  const logoInput = safeEl("logoInput");
  if(!logoImg || !logoInput) return;

  const stored = localStorage.getItem("logoDataUrl");
  if(stored){
    logoImg.src = stored;
  } else {
    logoImg.src = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
        <defs>
          <radialGradient id="g" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stop-color="#d4af37" stop-opacity=".95"/>
            <stop offset="100%" stop-color="#1f6f50" stop-opacity=".35"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="transparent"/>
        <circle cx="128" cy="128" r="86" fill="url(#g)" stroke="rgba(212,175,55,.55)" stroke-width="6"/>
        <text x="128" y="144" text-anchor="middle" font-family="Inter, Arial" font-size="56" fill="rgba(242,242,242,.92)" font-weight="900">G</text>
      </svg>
    `);
  }

  logoImg.addEventListener("click", ()=> logoInput.click());
  logoInput.addEventListener("change", ()=>{
    const file = logoInput.files && logoInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      const url = e.target.result;
      localStorage.setItem("logoDataUrl", url);
      logoImg.src = url;
      pushToast({ title:"Logo updated", sub:"Saved locally on this device." });
    };
    reader.readAsDataURL(file);
  });
})();

function removeLogo(){
  localStorage.removeItem("logoDataUrl");
  location.reload();
}
window.removeLogo = removeLogo;

// ================= FILTERS MODAL (open/close) =================
function openFiltersModal(){
  const m = safeEl("filtersModal");
  if(m) m.style.display = "flex";
}
function closeFiltersModal(){
  const m = safeEl("filtersModal");
  if(m) m.style.display = "none";
}
window.openFiltersModal = openFiltersModal;
window.closeFiltersModal = closeFiltersModal;

// ================= FILTERS =================
function hydrateFilterUI(){
  const q = safeEl("q");
  const s = safeEl("statusFilter");
  const l = safeEl("locationFilter");
  const f = safeEl("fromDate");
  const t = safeEl("toDate");
  const sort = safeEl("sortFilter");
  if(q) q.value = filters.q || "";
  if(s) s.value = filters.status || "all";
  if(l) l.value = filters.location || "all";
  if(f) f.value = filters.from || "";
  if(t) t.value = filters.to || "";
  if(sort) sort.value = filters.sort || "newest";
}

function applyFilters(){
  filters.q = safeVal("q") || "";
  filters.status = safeVal("statusFilter") || "all";
  filters.location = safeVal("locationFilter") || "all";
  filters.from = safeVal("fromDate") || "";
  filters.to = safeVal("toDate") || "";
  filters.sort = safeVal("sortFilter") || "newest";
  saveFilters();
  render();
}
window.applyFilters = applyFilters;

function clearFilters(){
  filters = { q:"", status:"all", location:"all", from:"", to:"", sort:"newest" };
  saveFilters();
  render();
}
window.clearFilters = clearFilters;

function entryMatchesFilters(e){
  const q = normalize(filters.q || "").trim();
  const status = (filters.status || "all").toLowerCase();
  const location = normalize(filters.location || "all");

  if(q){
    const blob = normalize([e.client, e.description, e.location, e.notes, e.contact, e.social].filter(Boolean).join(" "));
    if(!blob.includes(q)) return false;
  }
  if(status !== "all"){
    if(normalize(e.status) !== status) return false;
  }
  if(location !== "all"){
    if(normalize(e.location) !== location) return false;
  }

  const d = parseLocalDate(e.date);
  if(!d) return false;

  if(filters.from){
    const from = parseLocalDate(filters.from);
    if(from && d < from) return false;
  }
  if(filters.to){
    const to = parseLocalDate(filters.to);
    if(to && d > to) return false;
  }

  return true;
}

function getFilteredEntries(){
  const out = entries.filter(entryMatchesFilters);
  if(filters.sort === "oldest"){
    out.sort((a,b)=> a.id - b.id);
  } else {
    out.sort((a,b)=> b.id - a.id);
  }
  return out;
}

// ================= STATS =================
function updateStats(list){
  const todayKey = localTodayKey();
  const today = list.filter(e=>e.date === todayKey).reduce((s,e)=> s + totalForTotalsNet(e), 0);

  const now = new Date();
  const weekStart = new Date(now);
  const day = now.getDay();
  weekStart.setDate(now.getDate() - day);
  weekStart.setHours(0,0,0,0);

  const week = list.reduce((s,e)=>{
    const d = parseLocalDate(e.date);
    if(!d) return s;
    if(d >= weekStart) return s + totalForTotalsNet(e);
    return s;
  }, 0);

  const month = list.reduce((s,e)=>{
    const d = parseLocalDate(e.date);
    if(!d) return s;
    if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()){
      return s + totalForTotalsNet(e);
    }
    return s;
  }, 0);

  const qIdx = currentQuarterIndex(now);
  const quarter = list.reduce((s,e)=>{
    const d = parseLocalDate(e.date);
    if(!d) return s;
    if(d.getFullYear() === now.getFullYear() && currentQuarterIndex(d) === qIdx){
      return s + totalForTotalsNet(e);
    }
    return s;
  }, 0);

  const year = list.reduce((s,e)=>{
    const d = parseLocalDate(e.date);
    if(!d) return s;
    if(d.getFullYear() === now.getFullYear()){
      return s + totalForTotalsNet(e);
    }
    return s;
  }, 0);

  const t = safeEl("todayTotal"); if(t) t.textContent = money(today);
  const w = safeEl("weekTotal"); if(w) w.textContent = money(week);
  const m = safeEl("monthTotal"); if(m) m.textContent = money(month);
  const q = safeEl("quarterTotal"); if(q) q.textContent = money(quarter);
  const y = safeEl("yearTotal"); if(y) y.textContent = money(year);

  const pill = safeEl("splitPillPct");
  if(pill) pill.textContent = `${clampPct(splitSettings.defaultPct || 100)}%`;
}

// ================= ENTRY FORM =================
function set(id, val){
  const el = safeEl(id);
  if(el) el.value = (val === null || val === undefined) ? "" : val;
}

function openForm(){
  editingId = null;
  if (!formModal) return;
  formModal.style.display="flex";

  const dateEl = safeEl("date");
  if(dateEl) dateEl.value = localTodayKey();

  const statusEl = safeEl("status");
  if(statusEl) statusEl.value = "unpaid";

  if(prefillClient){
    const c = safeEl("client"); if(c) c.value = prefillClient.client || "";
    const ct = safeEl("contact"); if(ct) ct.value = prefillClient.contact || "";
    const s = safeEl("social"); if(s) s.value = prefillClient.social || "";
    prefillClient = null;
  }
}

function resetForm(){
  const modal = safeEl("formModal");
  if(!modal) return;

  modal.querySelectorAll("input, textarea, select").forEach(el=>{
    if(el.type === "file") el.value = "";
    else el.value = "";
  });

  const sessions = safeEl("sessions");
  if(sessions) sessions.innerHTML="";
}
function closeForm(){
  if (!formModal) return;
  formModal.style.display="none";
  resetForm();
  editingId = null;
}

function addSession(){
  const container = safeEl("sessions");
  if(!container) return;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <div class="field">
      <label>Session Amount</label>
      <input type="number" class="session-amount" min="0" step="0.01">
    </div>
    <div class="field">
      <label>Session Note</label>
      <input type="text" class="session-note">
    </div>
  `;
  container.appendChild(row);
}

window.openForm = openForm;
window.closeForm = closeForm;
window.addSession = addSession;

// ================= QUICK ADD: BAMMER =================
function openBammerQuick(){
  if(!bammerModal) return;
  safeEl("bDate").value = localTodayKey();
  safeEl("bClient").value = prefillClient?.client || "";
  safeEl("bDesc").value = "";
  safeEl("bLocation").value = "";
  safeEl("bTotal").value = "";
  safeEl("bStatus").value = "paid";
  prefillClient = null;
  bammerModal.style.display = "flex";
}
function closeBammerQuick(){
  if(!bammerModal) return;
  bammerModal.style.display = "none";
}
function saveBammer(){
  const date = safeVal("bDate");
  const client = (safeVal("bClient") || "").trim();
  const total = Number(safeVal("bTotal") || 0);
  if(!date || !client){ alert("Date + Client required."); return; }

  const before = getClientProgressSnapshot(client);

  const entry = {
    id: Date.now(),
    date,
    client,
    description: safeVal("bDesc") || "",
    location: safeVal("bLocation") || "",
    total,
    payments: [{ amount: total, kind:"session" }],
    status: safeVal("bStatus") || "paid",
    contact: "",
    social: "",
    notes: "",
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  };
  entries.push(entry);
  save();
  closeBammerQuick();

  const after = getClientProgressSnapshot(client);
  maybeNotifyClientProgress(client, before, after);
}
window.openBammerQuick = openBammerQuick;
window.closeBammerQuick = closeBammerQuick;
window.saveBammer = saveBammer;

// ================= QUICK ADD: DEPOSIT ONLY =================
function openDepositQuick(){
  if(!depositModal) return;
  safeEl("dDate").value = localTodayKey();
  safeEl("dClient").value = prefillClient?.client || "";
  safeEl("dContact").value = prefillClient?.contact || "";
  safeEl("dSocial").value = prefillClient?.social || "";
  safeEl("dDesc").value = "";
  safeEl("dDeposit").value = "";
  safeEl("dTotal").value = "";
  safeEl("dLocation").value = "";
  prefillClient = null;
  depositModal.style.display = "flex";
}
function closeDepositQuick(){
  if(!depositModal) return;
  depositModal.style.display = "none";
}
function saveDepositOnly(){
  const date = safeVal("dDate");
  const client = (safeVal("dClient") || "").trim();
  const dep = Number(safeVal("dDeposit") || 0);
  const total = Number(safeVal("dTotal") || 0);

  if(!date || !client || !(dep > 0)){
    alert("Date + Client + Deposit amount required.");
    return;
  }

  const before = getClientProgressSnapshot(client);

  const entry = {
    id: Date.now(),
    date,
    client,
    contact: safeVal("dContact") || "",
    social: safeVal("dSocial") || "",
    description: safeVal("dDesc") || "",
    location: safeVal("dLocation") || "",
    notes: "",
    total,
    payments: [{ amount: dep, kind:"deposit" }],
    status: "booked",
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  };
  entries.push(entry);
  save();
  closeDepositQuick();

  const after = getClientProgressSnapshot(client);
  maybeNotifyClientProgress(client, before, after);
}
window.openDepositQuick = openDepositQuick;
window.closeDepositQuick = closeDepositQuick;
window.saveDepositOnly = saveDepositOnly;

// ================= EDIT HISTORY =================
function diffFields(oldEntry, newEntry){
  const fields = [
    ["date","Date"],
    ["client","Client"],
    ["contact","Contact"],
    ["social","Social"],
    ["description","Description"],
    ["location","Location"],
    ["notes","Notes"],
    ["status","Status"],
    ["total","Total"]
  ];
  const changes = [];

  fields.forEach(([key,label])=>{
    const a = oldEntry[key];
    const b = newEntry[key];
    if(String(a ?? "") !== String(b ?? "")){
      changes.push({ field: label, oldValue: String(a ?? ""), newValue: String(b ?? "") });
    }
  });

  const oldPay = JSON.stringify(paymentsArray(oldEntry));
  const newPay = JSON.stringify(paymentsArray(newEntry));
  if(oldPay !== newPay){
    changes.push({ field:"Payments", oldValue:"updated", newValue:"updated" });
  }

  const oldHas = !!oldEntry.image;
  const newHas = !!newEntry.image;
  if(oldHas !== newHas){
    changes.push({ field:"image", oldValue: oldHas ? "has image" : "no image", newValue: newHas ? "has image" : "no image" });
  }

  return changes;
}

// ================= CLIENT REWARDS (badge + discount) =================
function clientKey(name){ return normalize(String(name||"")).trim(); }

function getClientEntries(name){
  const key = clientKey(name);
  return entries
    .filter(e => clientKey(e.client) === key)
    .slice()
    .sort((a,b)=> b.id - a.id);
}

function getClientTattooCount(name){
  const list = getClientEntries(name);
  return list.filter(isTattooEntry).length;
}

function getBestLevelForCount(count){
  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  const sorted = levels
    .filter(l => Number(l.minCount||0) > 0)
    .slice()
    .sort((a,b)=> Number(a.minCount) - Number(b.minCount));
  let best = null;
  for(const l of sorted){
    if(count >= Number(l.minCount||0)) best = l;
  }
  return best;
}

function getBestDiscountForCount(count){
  const tiers = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  const sorted = tiers
    .filter(t => Number(t.minCount||0) > 0)
    .slice()
    .sort((a,b)=> Number(a.minCount) - Number(b.minCount));
  let best = null;
  for(const t of sorted){
    if(count >= Number(t.minCount||0)) best = t;
  }
  return best;
}

function getClientNetTotal(name){
  return getClientEntries(name).reduce((sum,e)=> sum + totalForTotalsNet(e), 0);
}

function getClientProgressSnapshot(name){
  const cnt = getClientTattooCount(name);
  const level = getBestLevelForCount(cnt);
  const disc = getBestDiscountForCount(cnt);
  return {
    tattooCount: cnt,
    levelId: level ? level.id : "",
    levelName: level ? level.name : "",
    levelPng: level ? (level.pngDataUrl || "") : "",
    discountId: disc ? disc.id : "",
    discountLabel: disc ? disc.label : "",
    discountPct: disc ? Number(disc.percent||0) : 0
  };
}

function maybeNotifyClientProgress(name, before, after){
  if(!before || !after) return;

  const net = money(getClientNetTotal(name));

  if(before.levelId !== after.levelId && after.levelId){
    pushToast({
      title: `New Badge Unlocked — ${after.levelName}`,
      sub: `${name} hit ${after.tattooCount} tattoos.`,
      mini: `Client total: ${net}`,
      imgDataUrl: after.levelPng || "",
      actionLabel: "View Client",
      actionFn: ()=> openClientProfile(name)
    });
  }

  if(before.discountId !== after.discountId && after.discountId){
    pushToast({
      title: `Discount Tier Unlocked`,
      sub: `${name} is now eligible: ${after.discountLabel} (${after.discountPct}% off)`,
      mini: `Client total: ${net}`,
      imgDataUrl: after.levelPng || "",
      actionLabel: "View Client",
      actionFn: ()=> openClientProfile(name)
    });
  }
}

// ================= SAVE ENTRY (ADD/EDIT) =================
function saveEntry(){
  if(!formBox) return;

  clearInvalidMarks(formBox);

  const dateVal = safeVal("date");
  const clientVal = (safeVal("client") || "").trim();

  const errors = [];
  if(!dateVal) errors.push({ id:"date", msg:"Required" });
  if(!clientVal) errors.push({ id:"client", msg:"Required" });

  const totalValRaw = safeVal("total");
  const totalVal = Number(totalValRaw || 0);
  if(totalVal < 0) errors.push({ id:"total", msg:"Must be 0 or more" });

  const depositValRaw = safeVal("deposit");
  const depositVal = Number(depositValRaw || 0);
  if(depositVal < 0) errors.push({ id:"deposit", msg:"Must be 0 or more" });

  const statusVal = (safeVal("status") || "unpaid").toLowerCase();

  const payments = [];
  if(depositVal > 0) payments.push({ amount: depositVal, kind: "deposit" });

  const sessionAmounts = document.querySelectorAll(".session-amount");
  const sessionNotes = document.querySelectorAll(".session-note");

  sessionAmounts.forEach((input, i)=>{
    const val = Number(input.value || 0);
    if(val < 0){
      const field = input.closest('.field');
      if(field){
        field.classList.add('invalid');
        let m = field.querySelector('.field-err');
        if(!m){ m = document.createElement('div'); m.className = 'field-err'; field.appendChild(m); }
        m.textContent = 'Must be 0 or more';
      }
    }
    if(val > 0){
      payments.push({
        amount: val,
        kind: "session",
        note: sessionNotes[i] ? (sessionNotes[i].value || "") : ""
      });
    }
  });

  if(statusVal === "booked" && !(depositVal > 0)){
    errors.push({ id:"deposit", msg:"Booked needs a deposit" });
  }

  if(errors.length){
    errors.forEach(e=> markInvalid(e.id, e.msg));
    scrollToFirstInvalid(formBox);
    return;
  }

  const before = getClientProgressSnapshot(clientVal);

  const base = {
    date: dateVal,
    client: clientVal,
    contact: safeVal("contact") || "",
    social: safeVal("social") || "",
    description: safeVal("description") || "",
    location: safeVal("location") || "",
    notes: safeVal("notes") || "",
    total: totalVal,
    payments,
    status: statusVal
  };

  const warnings = [];
  const paidSoFar = payments.reduce((s,p)=> s + Number(p.amount || 0), 0);

  if(statusVal === "paid" && totalVal > 0 && paidSoFar < totalVal){
    warnings.push("Status is PAID but paid so far is less than Total.");
  }
  if(statusVal === "unpaid" && paidSoFar > 0){
    warnings.push("Status is UNPAID but payments exist.");
  }
  if(statusVal === "partial" && paidSoFar <= 0){
    warnings.push("Status is PARTIAL but no payments were entered.");
  }
  if(totalVal > 0 && depositVal > totalVal){
    warnings.push("Deposit is greater than Total.");
  }

  if(warnings.length){
    const ok = confirm("Quick check:\n\n" + warnings.map(w=> "• " + w).join("\n") + "\n\nSave anyway?");
    if(!ok) return;
  }

  if(editingId){
    const idx = entries.findIndex(e=>e.id===editingId);
    if(idx === -1){ closeForm(); return; }

    const old = entries[idx];
    const next = Object.assign({}, old, base);

    next.image = old.image || null;

    const ts = new Date().toISOString();
    if(!Array.isArray(next.editHistory)) next.editHistory = [];
    const changes = diffFields(old, next);
    next.editHistory.push({ timestamp: ts, changes: changes.length ? changes : [{ field:"(no changes)", oldValue:"", newValue:"" }] });
    next.updatedAt = ts;

    entries[idx] = next;
    save();
    closeForm();

    const after = getClientProgressSnapshot(clientVal);
    maybeNotifyClientProgress(clientVal, before, after);
  } else {
    entries.push(Object.assign({}, base, {
      id: Date.now(),
      image: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      editHistory: []
    }));
    save();
    closeForm();

    const after = getClientProgressSnapshot(clientVal);
    maybeNotifyClientProgress(clientVal, before, after);
  }
}
window.saveEntry = saveEntry;

// ================= CLIENT PROFILES =================
function guessLatestField(list, field){
  for(const e of list){
    const v = (e[field] || "").trim();
    if(v) return v;
  }
  return "";
}

function badgeHtmlForClient(name){
  const snap = getClientProgressSnapshot(name);
  if(!snap.levelId) return "";
  const img = snap.levelPng ? `<img src="${snap.levelPng}" alt="badge">` : "";
  return `<span class="client-badge" title="Badge level">${img}${snap.levelName} (${snap.tattooCount})</span>`;
}

function openClientProfile(name){
  if(!clientModal || !clientBox) return;
  const list = getClientEntries(name);
  if(!list.length){
    alert("No entries found for that client.");
    return;
  }

  const displayName = list[0].client;

  let net = 0, gross = 0;
  const statusCounts = { paid:0, partial:0, unpaid:0, no_show:0, booked:0 };
  list.forEach(e=>{
    gross += totalForTotalsGross(e);
    net += totalForTotalsNet(e);
    const s = (e.status || "unpaid").toLowerCase();
    if(statusCounts[s] !== undefined) statusCounts[s]++;
  });

  const lastDate = list[0].date;
  const contact = guessLatestField(list, "contact");
  const social = guessLatestField(list, "social");

  const snap = getClientProgressSnapshot(displayName);
  const discountLine = snap.discountId
    ? `<div>Discount: <strong>${snap.discountLabel}</strong> (${snap.discountPct}% off)</div>`
    : `<div style="opacity:.75;">Discount: —</div>`;

  clientBox.innerHTML = `
    <div class="modal-title">Client — ${displayName}</div>

    <div class="summary-box" style="margin-top:0;">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          ${badgeHtmlForClient(displayName) || `<span class="hint">No badge yet</span>`}
        </div>
        <div class="hint">Tattoo count: <b style="color:var(--gold)">${snap.tattooCount}</b></div>
      </div>
      <div style="margin-top:10px;">
        ${discountLine}
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-box">
        <div style="font-weight:900;color:var(--gold);">Totals</div>
        <div>NET: <strong>${money(net)}</strong></div>
        <div>Gross: <strong>${money(gross)}</strong></div>
        <div>Entries: <strong>${list.length}</strong></div>
        <div>Last: <strong>${lastDate}</strong></div>
      </div>
      <div class="summary-box">
        <div style="font-weight:900;color:var(--gold);">Status</div>
        <div>BOOKED: <strong>${statusCounts.booked}</strong></div>
        <div>PAID: <strong>${statusCounts.paid}</strong></div>
        <div>PARTIAL: <strong>${statusCounts.partial}</strong></div>
        <div>UNPAID: <strong>${statusCounts.unpaid}</strong></div>
        <div>NO SHOW: <strong>${statusCounts.no_show}</strong></div>
      </div>
    </div>

    <div class="summary-box">
      <div style="font-weight:900;color:var(--gold);">Saved info</div>
      ${contact ? `<div>Contact: <strong>${contact}</strong></div>` : `<div style="opacity:.75;">Contact: —</div>`}
      ${social ? `<div>Social: <strong>${social}</strong></div>` : `<div style="opacity:.75;">Social: —</div>`}
      <div class="actions-row">
        <button type="button" onclick="repeatClientFull()">New Entry (prefill)</button>
        <button type="button" class="secondarybtn" onclick="repeatClientBammer()">Bammer (prefill)</button>
        <button type="button" class="secondarybtn" onclick="repeatClientDeposit()">Deposit (prefill)</button>
      </div>
    </div>

    <div class="summary-box">
      <div style="font-weight:900;color:var(--gold);">History</div>
      ${list.slice(0, 30).map(e=>{
        const paidLine = money(paidForPreview(e));
        const row2 = [e.location, e.description].filter(Boolean).join(" • ");
        return `
          <div class="client-entry" onclick="openEntryFromClient(${e.id})">
            <div class="top">
              <div><strong>${String(e.status||"").toUpperCase()}</strong> — Paid: ${paidLine}</div>
              <div class="date">${e.date}</div>
            </div>
            <div class="desc">${row2 || ""}</div>
          </div>
        `;
      }).join("")}
    </div>

    <div class="actions-row">
      <button type="button" class="secondarybtn" onclick="closeClientProfile()">Close</button>
    </div>
  `;

  clientModal.style.display = "flex";
}
window.openClientProfile = openClientProfile;

function closeClientProfile(){
  if(!clientModal) return;
  clientModal.style.display = "none";
}
window.closeClientProfile = closeClientProfile;

function openEntryFromClient(id){
  closeClientProfile();
  viewEntry(id);
}
window.openEntryFromClient = openEntryFromClient;

function repeatClientFull(){
  if(!clientModal) return;
  const name = (clientBox.querySelector(".modal-title")?.textContent || "").replace("Client — ","").trim();
  const list = getClientEntries(name);
  if(!list.length) return;
  const contact = guessLatestField(list, "contact");
  const social = guessLatestField(list, "social");
  prefillClient = { client: name, contact, social };
  closeClientProfile();
  openForm();
}
window.repeatClientFull = repeatClientFull;

function repeatClientBammer(){
  if(!clientModal) return;
  const name = (clientBox.querySelector(".modal-title")?.textContent || "").replace("Client — ","").trim();
  const list = getClientEntries(name);
  if(!list.length) return;
  const contact = guessLatestField(list, "contact");
  const social = guessLatestField(list, "social");
  prefillClient = { client: name, contact, social };
  closeClientProfile();
  openBammerQuick();
}
window.repeatClientBammer = repeatClientBammer;

function repeatClientDeposit(){
  if(!clientModal) return;
  const name = (clientBox.querySelector(".modal-title")?.textContent || "").replace("Client — ","").trim();
  const list = getClientEntries(name);
  if(!list.length) return;
  const contact = guessLatestField(list, "contact");
  const social = guessLatestField(list, "social");
  prefillClient = { client: name, contact, social };
  closeClientProfile();
  openDepositQuick();
}
window.repeatClientDeposit = repeatClientDeposit;

// ================= VIEW ENTRY =================
function viewEntry(id){
  const entry = entries.find(e=>e.id===id);
  if(!entry || !viewModal || !viewBox) return;
  viewingId = id;

  const paid = paidForPreview(entry);
  const deposit = depositAmount(entry);
  const sessions = paymentsArray(entry).filter(p=>p.kind==="session");

  viewBox.innerHTML = `
    <div class="modal-title">Entry — ${entry.client}</div>

    <div class="summary-box" style="margin-top:0;">
      <div><strong>Date:</strong> ${entry.date}</div>
      <div><strong>Status:</strong> ${String(entry.status||"").toUpperCase()}</div>
      <div><strong>Total:</strong> ${money(entry.total)}</div>
      <div><strong>Paid:</strong> ${money(paid)}</div>
      ${deposit ? `<div><strong>Deposit:</strong> ${money(deposit)}</div>` : ``}
      ${entry.location ? `<div><strong>Location:</strong> ${entry.location}</div>` : ``}
      ${entry.contact ? `<div><strong>Contact:</strong> ${entry.contact}</div>` : ``}
      ${entry.social ? `<div><strong>Social:</strong> ${entry.social}</div>` : ``}
      ${entry.description ? `<div style="margin-top:10px;"><strong>Description:</strong><br>${entry.description}</div>` : ``}
      ${entry.notes ? `<div style="margin-top:10px;"><strong>Notes:</strong><br>${entry.notes}</div>` : ``}
    </div>

    ${sessions.length ? `
      <div class="summary-box">
        <div style="font-weight:900;color:var(--gold);">Sessions</div>
        ${sessions.map(s=> `<div>${money(s.amount)} ${s.note ? `— <span style="opacity:.85;">${s.note}</span>` : ``}</div>`).join("")}
      </div>
    ` : ``}

    <details>
      <summary>Edit history</summary>
      <div style="margin-top:10px;">
        ${(Array.isArray(entry.editHistory) && entry.editHistory.length)
          ? entry.editHistory.slice().reverse().map(h=>{
              const list = (h.changes || []).map(c=> `<li><strong>${c.field}:</strong> ${c.oldValue} → ${c.newValue}</li>`).join("");
              return `<div style="margin:10px 0;"><div class="hint">${h.timestamp}</div><ul style="margin:8px 0 0 18px;">${list}</ul></div>`;
            }).join("")
          : `<div class="hint">No edits yet.</div>`
        }
      </div>
    </details>

    <div class="actions-row">
      <button type="button" onclick="editEntry(${entry.id})">Edit</button>
      <button type="button" class="dangerbtn" onclick="deleteEntry(${entry.id})">Delete</button>
      <button type="button" class="secondarybtn" onclick="closeView()">Close</button>
    </div>
  `;

  viewModal.style.display = "flex";
}
window.viewEntry = viewEntry;

function closeView(){
  if(!viewModal) return;
  viewModal.style.display = "none";
  viewingId = null;
}
window.closeView = closeView;

function deleteEntry(id){
  const ok = confirm("Delete this entry permanently?");
  if(!ok) return;
  entries = entries.filter(e=>e.id !== id);
  save();
  closeView();
}
window.deleteEntry = deleteEntry;

function editEntry(id){
  const entry = entries.find(e=>e.id===id);
  if(!entry) return;

  editingId = id;
  if(!formModal) return;

  formModal.style.display = "flex";
  set("date", entry.date);
  set("client", entry.client);
  set("contact", entry.contact || "");
  set("social", entry.social || "");
  set("description", entry.description || "");
  set("location", entry.location || "");
  set("notes", entry.notes || "");
  set("total", Number(entry.total || 0));
  set("status", entry.status || "unpaid");

  const sessions = safeEl("sessions");
  if(sessions) sessions.innerHTML = "";

  set("deposit", depositAmount(entry));

  const sessionPays = paymentsArray(entry).filter(p => p.kind !== "deposit");
  sessionPays.forEach(p=>{
    addSession();
    const amounts = document.querySelectorAll(".session-amount");
    const notes = document.querySelectorAll(".session-note");
    const idx = amounts.length - 1;
    if(amounts[idx]) amounts[idx].value = Number(p.amount || 0);
    if(notes[idx]) notes[idx].value = p.note || "";
  });
}
window.editEntry = editEntry;

// ================= SETTINGS =================
function openSettings(){
  if(!settingsModal) return;
  safeEl("defaultSplitPct").value = clampPct(splitSettings.defaultPct || 100);
  safeEl("overrideMonth").value = "";
  safeEl("overridePct").value = "";
  renderOverrideList();
  settingsModal.style.display = "flex";
}
function closeSettings(){
  if(!settingsModal) return;
  settingsModal.style.display = "none";
}
window.openSettings = openSettings;
window.closeSettings = closeSettings;

function renderOverrideList(){
  const out = safeEl("overrideList");
  if(!out) return;
  const mo = splitSettings.monthOverrides || {};
  const keys = Object.keys(mo).sort();
  if(!keys.length){
    out.textContent = "No month overrides.";
    return;
  }
  out.innerHTML = keys.map(k=> `<div>${k}: <b style="color:var(--gold)">${clampPct(mo[k])}%</b></div>`).join("");
}

function saveSplitSettings(){
  const pct = clampPct(safeVal("defaultSplitPct") || 100);
  splitSettings.defaultPct = pct;
  localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
  pushToast({ title:"Settings saved", sub:`Default split: ${pct}%` });
  closeSettings();
  render();
}
window.saveSplitSettings = saveSplitSettings;

function saveMonthOverride(){
  const month = safeVal("overrideMonth");
  const pct = clampPct(safeVal("overridePct") || 0);
  if(!month){ alert("Pick a month."); return; }
  if(!splitSettings.monthOverrides) splitSettings.monthOverrides = {};
  splitSettings.monthOverrides[month] = pct;
  localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
  renderOverrideList();
  pushToast({ title:"Month override saved", sub:`${month}: ${pct}%` });
  render();
}
window.saveMonthOverride = saveMonthOverride;

function removeMonthOverride(){
  const month = safeVal("overrideMonth");
  if(!month){ alert("Pick a month."); return; }
  if(splitSettings.monthOverrides && splitSettings.monthOverrides[month] !== undefined){
    delete splitSettings.monthOverrides[month];
    localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
    renderOverrideList();
    pushToast({ title:"Month override removed", sub:month });
    render();
  }
}
window.removeMonthOverride = removeMonthOverride;

// ================= REWARDS UI =================
function openRewards(){
  if(!rewardsModal) return;
  buildRewardsUI();
  rewardsModal.style.display = "flex";
}
function closeRewards(){
  if(!rewardsModal) return;
  rewardsModal.style.display = "none";
}
window.openRewards = openRewards;
window.closeRewards = closeRewards;

function buildRewardsUI(){
  const levelsList = safeEl("levelsList");
  const discountsList = safeEl("discountsList");
  if(levelsList) levelsList.innerHTML = "";
  if(discountsList) discountsList.innerHTML = "";

  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  levels.forEach(l=>{
    const box = document.createElement("div");
    box.className = "summary-box";
    box.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Badge Name</label>
          <input id="lvlName_${l.id}" type="text" value="${l.name || ""}">
        </div>
        <div class="field">
          <label>Min Tattoo Count</label>
          <input id="lvlMin_${l.id}" type="number" min="0" step="1" value="${Number(l.minCount||0)}">
        </div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>Badge PNG</label>
        <input type="file" id="lvlFile_${l.id}" accept="image/png,image/*" />
        ${l.pngDataUrl ? `<div class="hint" style="margin-top:6px;">Current badge saved.</div>` : `<div class="hint" style="margin-top:6px;">No PNG uploaded.</div>`}
      </div>
      <div class="actions-row">
        <button type="button" class="dangerbtn" onclick="removeBadgeLevel('${l.id}')">Remove</button>
      </div>
    `;
    if(levelsList) levelsList.appendChild(box);
  });

  const discounts = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  discounts.forEach(d=>{
    const box = document.createElement("div");
    box.className = "summary-box";
    box.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Label</label>
          <input id="discLabel_${d.id}" type="text" value="${d.label || ""}">
        </div>
        <div class="field">
          <label>Min Tattoo Count</label>
          <input id="discMin_${d.id}" type="number" min="0" step="1" value="${Number(d.minCount||0)}">
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>Percent</label>
          <input id="discPct_${d.id}" type="number" min="0" max="100" step="1" value="${Number(d.percent||0)}">
        </div>
        <div class="field"></div>
      </div>
      <div class="actions-row">
        <button type="button" class="dangerbtn" onclick="removeDiscountTier('${d.id}')">Remove</button>
      </div>
    `;
    if(discountsList) discountsList.appendChild(box);
  });
}

function addBadgeLevel(){
  const id = uid("lvl");
  if(!rewardsSettings.levels) rewardsSettings.levels = [];
  rewardsSettings.levels.push({ id, name:"New Badge", minCount: 1, pngDataUrl:"" });
  buildRewardsUI();
}
window.addBadgeLevel = addBadgeLevel;

function removeBadgeLevel(id){
  rewardsSettings.levels = (rewardsSettings.levels || []).filter(l=>l.id !== id);
  buildRewardsUI();
}
window.removeBadgeLevel = removeBadgeLevel;

function addDiscountTier(){
  const id = uid("disc");
  if(!rewardsSettings.discounts) rewardsSettings.discounts = [];
  rewardsSettings.discounts.push({ id, label:"New Discount", minCount: 1, percent: 5 });
  buildRewardsUI();
}
window.addDiscountTier = addDiscountTier;

function removeDiscountTier(id){
  rewardsSettings.discounts = (rewardsSettings.discounts || []).filter(d=>d.id !== id);
  buildRewardsUI();
}
window.removeDiscountTier = removeDiscountTier;

function saveRewards(){
  const levels = (rewardsSettings.levels || []);
  const discounts = (rewardsSettings.discounts || []);

  levels.forEach(l=>{
    const nameEl = safeEl(`lvlName_${l.id}`);
    const minEl = safeEl(`lvlMin_${l.id}`);
    if(nameEl) l.name = (nameEl.value || "").trim() || "Badge";
    if(minEl) l.minCount = Math.max(0, Number(minEl.value || 0));
  });

  discounts.forEach(d=>{
    const labelEl = safeEl(`discLabel_${d.id}`);
    const minEl = safeEl(`discMin_${d.id}`);
    const pctEl = safeEl(`discPct_${d.id}`);
    if(labelEl) d.label = (labelEl.value || "").trim() || "Discount";
    if(minEl) d.minCount = Math.max(0, Number(minEl.value || 0));
    if(pctEl) d.percent = Math.max(0, Math.min(100, Number(pctEl.value || 0)));
  });

  const fileReads = levels.map(l=>{
    const fileEl = safeEl(`lvlFile_${l.id}`);
    const file = fileEl && fileEl.files ? fileEl.files[0] : null;
    if(!file) return Promise.resolve();
    return new Promise((resolve)=>{
      const reader = new FileReader();
      reader.onload = (e)=>{ l.pngDataUrl = e.target.result; resolve(); };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(fileReads).then(()=>{
    rewardsSettings.levels = (rewardsSettings.levels || []).slice().sort((a,b)=> Number(a.minCount||0) - Number(b.minCount||0));
    rewardsSettings.discounts = (rewardsSettings.discounts || []).slice().sort((a,b)=> Number(a.minCount||0) - Number(b.minCount||0));
    saveRewardsSettings();
    pushToast({ title:"Rewards saved", sub:"Badges + discounts will auto-update as you log entries." });
    closeRewards();
    render();
  });
}
window.saveRewards = saveRewards;

// ================= UI BUILDERS =================
// ================= ACCORDION STATE (keep open + scroll) =================
function captureAccordionState(){
  const container = safeEl("entries");
  const openKeys = [];
  if(container){
    container.querySelectorAll(".accordion[data-acc-key]").forEach(acc=>{
      const key = acc.getAttribute("data-acc-key") || "";
      const content = acc.querySelector(".accordion-content");
      if(key && content && content.style.display === "block"){
        openKeys.push(key);
      }
    });
  }
  return {
    openKeys,
    scrollY: window.scrollY || 0
  };
}

function depthForKey(key){
  return String(key||"").split("|").length;
}

function restoreAccordionState(state){
  const container = safeEl("entries");
  if(!container || !state) return;

  const keys = Array.isArray(state.openKeys) ? state.openKeys.slice() : [];
  keys.sort((a,b)=> depthForKey(a) - depthForKey(b));

  keys.forEach(key=>{
    const acc = container.querySelector(`.accordion[data-acc-key="${CSS.escape(key)}"]`);
    if(!acc) return;
    const content = acc.querySelector(".accordion-content");
    const chev = acc.querySelector(".chev");
    if(content){
      content.style.display = "block";
      if(chev) chev.textContent = "▴";
    }
  });

  const y = Number(state.scrollY || 0);
  requestAnimationFrame(()=> window.scrollTo(0, y));
}

function createAccordion(title, badgeText, accKey){
  const wrap = document.createElement("div");
  wrap.className = "accordion";
  if(accKey) wrap.setAttribute("data-acc-key", String(accKey));

  const header = document.createElement("div");
  header.className = "accordion-header";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";

  const t = document.createElement("div");
  t.className = "accordion-title";
  t.textContent = title;
  left.appendChild(t);

  if(badgeText !== undefined && badgeText !== null){
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = badgeText;
    left.appendChild(b);
  }

  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = "▾";

  header.appendChild(left);
  header.appendChild(chev);

  const content = document.createElement("div");
  content.className = "accordion-content";

  header.addEventListener("click", ()=>{
    const isOpen = content.style.display === "block";
    content.style.display = isOpen ? "none" : "block";
    chev.textContent = isOpen ? "▾" : "▴";
  });

  wrap.appendChild(header);
  wrap.appendChild(content);

  return { wrap, content };
}

// ================= RENDER =================
function render(){
  hydrateFilterUI();

  const locationSelect = safeEl("locationFilter");
  if(locationSelect){
    const current = filters.location || "all";
    const locs = Array.from(new Set(entries.map(e=>e.location).filter(Boolean))).sort();
    locationSelect.innerHTML =
      `<option value="all">All</option>` +
      locs.map(l=>`<option value="${l}">${l}</option>`).join("");
    locationSelect.value = current;
  }

  const container = safeEl("entries");
  if(!container) return;

  const accState = captureAccordionState();

  container.innerHTML = "";

  const list = getFilteredEntries();

  if(list.length === 0){
    container.innerHTML = "<p style='opacity:.65; padding: 10px 2px;'>No entries match your filters.</p>";
    updateStats(list);
    restoreAccordionState(accState);
    return;
  }

  const grouped = {};
  list.forEach(e=>{
    const d = parseLocalDate(e.date);
    if(!d) return;

    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    if(!grouped[y]) grouped[y] = {};
    if(!grouped[y][m]) grouped[y][m] = {};
    if(!grouped[y][m][day]) grouped[y][m][day] = [];
    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a,b)=>Number(b)-Number(a)).forEach(year=>{
    const yearAmtNet = Object.values(grouped[year])
      .flatMap(mo=>Object.values(mo).flat())
      .reduce((sum,e)=>sum + totalForTotalsNet(e), 0);

    const yearKey = `Y:${year}`;
    const yearAcc = createAccordion(String(year), money(yearAmtNet), yearKey);
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx=>{
      const monthAmtNet = Object.values(grouped[year][monthIdx])
        .flat()
        .reduce((sum,e)=>sum + totalForTotalsNet(e), 0);

      const monthKey = `${yearKey}|M:${monthIdx}`;
      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmtNet), monthKey);
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum=>{
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmtNet = dayEntries.reduce((sum,e)=>sum + totalForTotalsNet(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx)+1)}-${pad2(dayNum)}`;
        const dayKey = `${monthKey}|D:${dateLabel}`;
        const dayAcc = createAccordion(dateLabel, money(dayAmtNet), dayKey);
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries.forEach(entry=>{
          const paidLine = money(paidForPreview(entry));
          const loc = (entry.location || "").trim();
          const desc = (entry.description || "").trim();
          const row2 = [loc, desc].filter(Boolean).join(" • ");

          const badge = badgeHtmlForClient(entry.client);

          const row = document.createElement("div");
          row.className = "entry";
          row.innerHTML = `
            <div class="entry-left">
              <div class="entry-name">
                <span class="client-link" data-client="${entry.client}">${entry.client}</span>
                ${badge || ``}
              </div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${row2 || ""}</div>
              </div>
            </div>
            <div class="status ${entry.status}">${entry.status}</div>
          `;

          row.addEventListener("click", (e)=>{
            const clientLink = e.target.closest(".client-link");
            if(clientLink){
              e.stopPropagation();
              const name = clientLink.getAttribute("data-client");
              openClientProfile(name);
              return;
            }
            viewEntry(entry.id);
          });

          dayAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);
  restoreAccordionState(accState);
}

// ================= INIT =================
render();

// ================= CLIENTS INDEX (existing) =================
(function wireClientsModal(){
  function renderClients(){
    const box = safeEl("clientsList");
    if(!box) return;

    const map = {};
    entries.forEach(e=>{
      const key = clientKey(e.client);
      if(!key) return;
      if(!map[key]){
        map[key] = {
          name: e.client,
          count: 0,
          lastDate: e.date
        };
      }
      if(isTattooEntry(e)) map[key].count++;
      if(e.date > map[key].lastDate) map[key].lastDate = e.date;
    });

    const list = Object.values(map).sort((a,b)=> (b.lastDate || "").localeCompare(a.lastDate || ""));

    box.innerHTML = `
      ${list.map(c=>`
        <div class="client-entry" onclick="openClientProfile('${String(c.name).replace(/'/g,"\\'")}')">
          <div class="top">
            <div><strong>${c.name}</strong></div>
            <div class="date">${c.lastDate || ""}</div>
          </div>
          <div class="desc">Tattoo count: ${c.count}</div>
        </div>
      `).join("")}
    `;
  }

  function openClientsPage(){
    const modal = safeEl("clientsModal");
    if(!modal) {
      alert('Missing Clients modal in index.html (id="clientsModal").');
      return;
    }
    renderClients();
    modal.style.display = "flex";
  }

  function closeClientsPage(){
    const modal = safeEl("clientsModal");
    if(!modal) return;
    modal.style.display = "none";
  }

  function closeClients(){ closeClientsPage(); }
  function openClients(){ openClientsPage(); }

  window.openClientsPage = openClientsPage;
  window.closeClientsPage = closeClientsPage;
  window.openClients = openClients;
  window.closeClients = closeClientsPage;
  if(typeof window.openClientsPage !== "function") window.openClientsPage = openClients;
  if(typeof window.closeClientsPage !== "function") window.closeClientsPage = closeClientsPage;

  const oldSave = window.save;
  if(typeof oldSave === "function"){
    window.save = function(){
      oldSave();
      const modal = safeEl("clientsModal");
      if(modal && modal.style.display === "flex") renderClients();
    };
  }
})();