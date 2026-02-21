/* =========================================================
   Globber’s Ink Log — RESTORE BUILD
   - Keeps “old working app” behavior + restores Clients/Profiles/Discounts
   - Fixes FAB reliably (no double tap, no dead taps)
   - No browser prompts/alerts
   ========================================================= */

const APP_VERSION = "restore-before-fab-broke-v1";

/* ---------- storage ---------- */
const LS = {
  ENTRIES: "entries",
  LOGO: "logoDataUrl",
  FILTERS: "filters",
  FILTERS_UI: "filtersUI",
  PAYDAY: "payday",
  STUDIO: "studioSettings", // split + discount rules + badge rules
};

const DEFAULT_FILTERS = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
const DEFAULT_FILTERS_UI = { open: false };

const DEFAULT_STUDIO = {
  splitDefaultPct: 60,              // ✅ your default
  payday: 0,                        // 0=Sunday default; user can change later if you want
  badgeRules: [                     // auto badges by tattoo count
    { min: 1,  name: "Fresh Ink" },
    { min: 3,  name: "Regular" },
    { min: 5,  name: "VIP" },
    { min: 10, name: "Legend" },
  ],
  discountRules: [                  // auto discount by tattoo count
    // type: "percent" | "static" | "free"
    { min: 5, type: "percent", value: 10, label: "VIP 10% Off" },
    { min: 10, type: "percent", value: 20, label: "Legend 20% Off" },
  ],
};

let entries = safeJsonParse(localStorage.getItem(LS.ENTRIES), []) || [];
let filters = safeJsonParse(localStorage.getItem(LS.FILTERS), DEFAULT_FILTERS) || DEFAULT_FILTERS;
let filtersUI = safeJsonParse(localStorage.getItem(LS.FILTERS_UI), DEFAULT_FILTERS_UI) || DEFAULT_FILTERS_UI;
let studio = safeJsonParse(localStorage.getItem(LS.STUDIO), DEFAULT_STUDIO) || DEFAULT_STUDIO;

let viewingId = null;
let editingId = null;

const $ = (id) => document.getElementById(id);
const on = (el, evt, fn, opts) => { if (el) el.addEventListener(evt, fn, opts); };
function safeJsonParse(s, fallback){ try { return JSON.parse(s); } catch { return fallback; } }
function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
const normalize = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2,"0");
function parseLocalDate(dateStr){
  const parts = String(dateStr||"").split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0,0,0,0);
  return dt;
}
function formatYYYYMM(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function monthName(year, monthIndex){
  return new Date(year, monthIndex, 1).toLocaleString("default", { month:"long" });
}
function money(n){
  const v = Number(n || 0);
  const ok = Number.isFinite(v) ? v : 0;
  return "$" + ok.toFixed(2).replace(/\.00$/, "");
}
function clampPct(p){
  p = Number(p);
  if (!Number.isFinite(p)) return 60;
  return Math.max(0, Math.min(100, p));
}

/* ---------- persistence ---------- */
function saveAll(){
  localStorage.setItem(LS.ENTRIES, JSON.stringify(entries));
  localStorage.setItem(LS.FILTERS, JSON.stringify(filters));
  localStorage.setItem(LS.FILTERS_UI, JSON.stringify(filtersUI));
  localStorage.setItem(LS.STUDIO, JSON.stringify(studio));
}

/* ---------- payments helpers ---------- */
function paymentsArray(entry){ return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry){ return paymentsArray(entry).reduce((sum,p)=>sum+Number(p.amount||0),0); }
function depositAmount(entry){
  return paymentsArray(entry).filter(p=>p.kind==="deposit").reduce((sum,p)=>sum+Number(p.amount||0),0);
}

/* totals rule (internal only):
   PAID => total price
   PARTIAL => paid so far
   else => 0
*/
function totalForTotalsGross(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  return 0;
}
function totalForTotalsNet(entry){
  const pct = clampPct(studio.splitDefaultPct ?? 60);
  return totalForTotalsGross(entry) * (pct / 100);
}

/* preview paid line:
   PAID => total price
   PARTIAL => paid so far
   BOOKED => deposit
   else => 0
*/
function paidForPreview(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

/* ---------- notifications (10s card) ---------- */
const TOAST_MS = 10000;
function toastCard({ title="Notification", sub="", icon="✨" } = {}){
  const root = $("toasts");
  if (!root) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.06);
        border:1px solid rgba(212,175,55,.25);display:flex;align-items:center;justify-content:center;flex:0 0 44px;">
        <div style="font-size:20px; line-height:1;">${escapeHtml(icon)}</div>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <div style="font-weight:900;color:var(--gold,#d4af37);">${escapeHtml(title)}</div>
          <button type="button" data-close style="border:1px solid rgba(255,255,255,.12);
            background:rgba(0,0,0,.18);color:rgba(255,255,255,.85);padding:6px 10px;border-radius:12px;font-weight:900;">✕</button>
        </div>
        ${sub ? `<div style="opacity:.90;margin-top:6px;word-break:break-word;">${escapeHtml(sub)}</div>` : ""}
      </div>
    </div>
  `;
  root.appendChild(el);

  const remove = () => {
    el.style.transition = "opacity 180ms ease, transform 180ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector("[data-close]")?.addEventListener("click", (e)=>{ e.stopPropagation(); remove(); });
  setTimeout(remove, TOAST_MS);
}

/* ---------- modal helpers ---------- */
const MODAL_IDS = [
  "formModal","viewModal","exportModal","bammerModal","depositModal",
  "clientsModal","clientModal","studioModal","appointmentsModal"
];
function closeAllModals(){ MODAL_IDS.forEach(id=>{ const m=$(id); if(m) m.style.display="none"; }); viewingId=null; editingId=null; }
function showModal(id){ closeAllModals(); const m=$(id); if(m) m.style.display="flex"; }
function hideModal(id){ const m=$(id); if(m) m.style.display="none"; }

function wireModalClickOff(modalId, boxId){
  const modal = $(modalId);
  const box = $(boxId);
  if (!modal || !box) return;
  on(modal,"click",(e)=>{ if(e.target===modal) hideModal(modalId); });
  on(box,"click",(e)=>e.stopPropagation());
}

/* ---------- logo ---------- */
function initLogo(){
  const img = $("logoImg");
  const input = $("logoInput");
  if (!img || !input) return;

  const saved = localStorage.getItem(LS.LOGO);
  if (saved) img.src = saved;

  on(img,"click",()=>input.click());
  on(input,"change",()=>{
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      localStorage.setItem(LS.LOGO, e.target.result);
      img.src = e.target.result;
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- filters ---------- */
function applyFiltersUIState(){
  const content = $("filtersContent");
  const chev = $("filtersChev");
  if (content) content.style.display = filtersUI.open ? "block" : "none";
  if (chev) chev.textContent = filtersUI.open ? "▴" : "▾";
}
function updateFiltersSummary(){
  const parts = [];
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (filters.status !== "all") parts.push(`Status: ${String(filters.status).toUpperCase()}`);
  if (filters.location !== "all") parts.push(`Loc: ${filters.location}`);
  if (filters.from) parts.push(`From: ${filters.from}`);
  if (filters.to) parts.push(`To: ${filters.to}`);
  if (filters.sort !== "newest") parts.push(`Sort: ${filters.sort}`);
  const s = $("filtersSummary");
  if (s) s.textContent = parts.length ? `• ${parts.join(" • ")}` : "• none";
}
function hydrateFilterUI(){
  if ($("q")) $("q").value = filters.q || "";
  if ($("statusFilter")) $("statusFilter").value = filters.status || "all";
  if ($("locationFilter")) $("locationFilter").value = filters.location || "all";
  if ($("fromDate")) $("fromDate").value = filters.from || "";
  if ($("toDate")) $("toDate").value = filters.to || "";
  if ($("sortFilter")) $("sortFilter").value = filters.sort || "newest";
  updateFiltersSummary();
  applyFiltersUIState();
}
function toggleFilters(){
  filtersUI.open = !filtersUI.open;
  saveAll();
  applyFiltersUIState();
}
function applyFilters(){
  filters.q = String($("q")?.value || "").trim();
  filters.status = $("statusFilter")?.value || "all";
  filters.location = $("locationFilter")?.value || "all";
  filters.from = $("fromDate")?.value || "";
  filters.to = $("toDate")?.value || "";
  filters.sort = $("sortFilter")?.value || "newest";
  saveAll();
  updateFiltersSummary();
  render();
}
function clearFilters(){
  filters = { ...DEFAULT_FILTERS };
  saveAll();
  hydrateFilterUI();
  render();
}
function passesFilters(entry){
  if (filters.status !== "all" && (entry.status || "unpaid") !== filters.status) return false;
  if (filters.location !== "all" && (entry.location || "") !== filters.location) return false;

  const d = parseLocalDate(entry.date);
  if (!d) return false;

  if (filters.from){
    const from = parseLocalDate(filters.from);
    if (from && d < from) return false;
  }
  if (filters.to){
    const to = parseLocalDate(filters.to);
    if (to && d > to) return false;
  }

  const q = normalize(filters.q);
  if (q){
    const hay = [entry.clientName, entry.description, entry.location].map(normalize).join(" | ");
    if (!hay.includes(q)) return false;
  }
  return true;
}
function getFilteredEntries(){
  const list = entries.filter(passesFilters);
  list.sort((a,b)=> (filters.sort==="oldest" ? (a.id-b.id) : (b.id-a.id)));
  return list;
}

/* ---------- client engine (profiles) ---------- */
function collectClients(){
  // build clients from entries (no separate DB to corrupt)
  const map = new Map();
  for (const e of entries){
    const name = String(e.clientName || "").trim();
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, tattooCount:0, totalGross:0, totalNet:0, lastSeen:null, upcomingBooked:0, badges:[], bestDiscount:null });
    const c = map.get(name);

    c.tattooCount += 1;
    c.totalGross += totalForTotalsGross(e);
    c.totalNet += totalForTotalsNet(e);

    const d = parseLocalDate(e.date);
    if (d && (!c.lastSeen || d > c.lastSeen)) c.lastSeen = d;

    if ((e.status||"").toLowerCase()==="booked"){
      const today = new Date(); today.setHours(0,0,0,0);
      if (d && d >= today) c.upcomingBooked += 1;
    }
  }

  // badges
  const rules = Array.isArray(studio.badgeRules) ? studio.badgeRules : DEFAULT_STUDIO.badgeRules;
  for (const c of map.values()){
    const got = rules.filter(r => c.tattooCount >= Number(r.min||0)).map(r=>String(r.name||"")).filter(Boolean);
    c.badges = got;
    c.bestDiscount = computeBestDiscount(c.tattooCount);
  }

  return Array.from(map.values()).sort((a,b)=> (b.totalNet - a.totalNet));
}

function computeBestDiscount(tattooCount){
  const rules = Array.isArray(studio.discountRules) ? studio.discountRules : [];
  const eligible = rules.filter(r => tattooCount >= Number(r.min||0));
  if (!eligible.length) return null;
  eligible.sort((a,b)=>Number(b.min||0)-Number(a.min||0));
  const r = eligible[0];
  return {
    min: Number(r.min||0),
    type: String(r.type||"percent"),
    value: Number(r.value||0),
    label: String(r.label||"Discount")
  };
}

/* ---------- stats ---------- */
function currentQuarterIndex(d){ return Math.floor(d.getMonth()/3); }
function getWeekWindowFromDate(anchorDate){
  const now = new Date(anchorDate);
  const payday = Number(studio.payday ?? 0);
  const currentDay = now.getDay();
  const diffToPayday = (currentDay - payday + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - diffToPayday);
  start.setHours(0,0,0,0);

  const end = new Date(start);
  end.setDate(start.getDate()+6);
  end.setHours(23,59,59,999);

  return { start, end };
}
function updateStats(list){
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindowFromDate(now);
  const qNow = currentQuarterIndex(now);

  let today=0, week=0, month=0, quarter=0, year=0;

  (list || entries).forEach(e=>{
    const d = parseLocalDate(e.date);
    if (!d) return;

    const amt = totalForTotalsNet(e);

    if (e.date === todayStr) today += amt;
    if (d.getFullYear() === now.getFullYear()){
      year += amt;
      if (currentQuarterIndex(d) === qNow) quarter += amt;
    }
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += amt;
    if (d >= weekWin.start && d <= weekWin.end) week += amt;
  });

  if ($("todayTotal")) $("todayTotal").textContent = money(today);
  if ($("weekTotal")) $("weekTotal").textContent = money(week);
  if ($("monthTotal")) $("monthTotal").textContent = money(month);
  if ($("quarterTotal")) $("quarterTotal").textContent = money(quarter);
  if ($("yearTotal")) $("yearTotal").textContent = money(year);
}

/* ---------- accordion ---------- */
function createAccordion(title, badgeText){
  const wrap = document.createElement("div");
  wrap.className = "accordion";

  const header = document.createElement("div");
  header.className = "accordion-header";

  const left = document.createElement("div");
  left.style.display="flex";
  left.style.alignItems="center";

  const t = document.createElement("div");
  t.className="accordion-title";
  t.textContent=title;
  left.appendChild(t);

  if (badgeText != null){
    const b = document.createElement("span");
    b.className="badge";
    b.textContent=badgeText;
    left.appendChild(b);
  }

  const chev = document.createElement("span");
  chev.className="chev";
  chev.textContent="▾";

  header.appendChild(left);
  header.appendChild(chev);

  const content = document.createElement("div");
  content.className="accordion-content";

  on(header,"click",()=>{
    const openNow = content.style.display === "block";
    content.style.display = openNow ? "none" : "block";
    chev.textContent = openNow ? "▾" : "▴";
  });

  wrap.appendChild(header);
  wrap.appendChild(content);
  return { wrap, content };
}

/* ---------- render ---------- */
function render(){
  hydrateFilterUI();

  // locations dropdown
  const locationSelect = $("locationFilter");
  if (locationSelect){
    const current = filters.location || "all";
    const locs = Array.from(new Set(entries.map(e=>e.location).filter(Boolean))).sort();
    locationSelect.innerHTML =
      `<option value="all">All Locations</option>` +
      locs.map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
    locationSelect.value = current;
  }

  const container = $("entries");
  if (!container) return;

  container.innerHTML = "";

  const list = getFilteredEntries();
  if (!list.length){
    container.innerHTML = "<p style='opacity:.65; padding: 10px 2px;'>No entries match your filters.</p>";
    updateStats(list);
    return;
  }

  // group year/month/day
  const grouped = {};
  list.forEach(e=>{
    const d = parseLocalDate(e.date);
    if (!d) return;
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    grouped[y] ??= {};
    grouped[y][m] ??= {};
    grouped[y][m][day] ??= [];
    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a,b)=>Number(b)-Number(a)).forEach(year=>{
    const yearAmt = Object.values(grouped[year]).flatMap(mo => Object.values(mo).flat())
      .reduce((sum,e)=>sum + totalForTotalsNet(e),0);

    const yearAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx=>{
      const monthAmt = Object.values(grouped[year][monthIdx]).flat()
        .reduce((sum,e)=>sum + totalForTotalsNet(e),0);

      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmt));
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum=>{
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmt = dayEntries.reduce((sum,e)=>sum + totalForTotalsNet(e),0);

        const dateLabel = `${year}-${pad2(Number(monthIdx)+1)}-${pad2(dayNum)}`;
        const dayAcc = createAccordion(dateLabel, money(dayAmt));
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries.forEach(entry=>{
          const paidLine = money(paidForPreview(entry));
          const row2 = [entry.location, entry.description].filter(Boolean).join(" • ");

          const row = document.createElement("div");
          row.className="entry";
          row.innerHTML = `
            <div class="entry-left">
              <div class="entry-name">${escapeHtml(entry.clientName || "")}</div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${escapeHtml(row2 || "")}</div>
              </div>
            </div>
            <div class="status ${escapeHtml(entry.status || "unpaid")}">${escapeHtml(entry.status || "unpaid")}</div>
          `;
          on(row,"click",()=>viewEntry(entry.id));
          dayAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);
}

/* ---------- forms ---------- */
function opt(val,label,current){
  const sel = String(current||"").toLowerCase()===val ? "selected" : "";
  return `<option value="${val}" ${sel}>${label}</option>`;
}

function openForm(existing=null){
  const box = $("formBox");
  if (!box) return;

  editingId = existing ? existing.id : null;

  const today = new Date().toISOString().split("T")[0];
  const entry = existing || {
    id: Date.now(),
    date: today,
    status: "unpaid",
    clientName: "",
    location: "",
    total: 0,
    description: "",
    notes: "",
    payments: [],
  };

  const dep = depositAmount(entry);
  const sessions = paymentsArray(entry).filter(p=>p.kind==="session");

  box.innerHTML = `
    <div class="modal-title">${existing ? "Edit Entry" : "Add Entry"}</div>

    <div class="row">
      <input id="date" type="date" value="${escapeHtml(entry.date || today)}">
      <select id="status">
        ${opt("unpaid","UNPAID",entry.status)}
        ${opt("partial","PARTIAL",entry.status)}
        ${opt("paid","PAID",entry.status)}
        ${opt("booked","BOOKED",entry.status)}
        ${opt("no_show","NO SHOW",entry.status)}
      </select>
    </div>

    <div class="row">
      <input id="clientName" placeholder="Client name" value="${escapeHtml(entry.clientName || "")}">
      <input id="location" placeholder="Location" value="${escapeHtml(entry.location || "")}">
    </div>

    <div class="row">
      <input id="total" type="number" placeholder="Total price" value="${Number(entry.total || 0)}">
      <input id="deposit" type="number" placeholder="Deposit (optional)" value="${Number(dep || 0)}">
    </div>

    <div class="row">
      <textarea id="description" placeholder="Location • Description">${escapeHtml(entry.description || "")}</textarea>
    </div>

    <div class="row">
      <textarea id="notes" placeholder="Notes (optional)">${escapeHtml(entry.notes || "")}</textarea>
    </div>

    <div style="margin-top:10px; font-weight:900; color: var(--gold, #d4af37);">Additional Sessions</div>
    <div id="sessions"></div>

    <div class="actionsRow" style="margin-top:10px;">
      <button type="button" id="btnAddSession">+ Additional session</button>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" id="btnSaveEntry">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseForm">Close</button>
    </div>
  `;

  const sessionsWrap = $("sessions");
  sessions.forEach(s => addSessionRow(s.amount, s.note || "", sessionsWrap));

  on($("btnAddSession"),"click",()=>addSessionRow("", "", $("sessions")));
  on($("btnSaveEntry"),"click",saveEntry);
  on($("btnCloseForm"),"click",()=>hideModal("formModal"));

  showModal("formModal");
}

function addSessionRow(amount="", note="", container){
  if (!container) return;
  const row = document.createElement("div");
  row.className="row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount" value="${escapeHtml(amount)}">
    <input type="text" class="session-note" placeholder="Session Note (optional)" value="${escapeHtml(note)}">
  `;
  container.appendChild(row);
}

function saveEntry(){
  const dateVal = $("date")?.value || "";
  const clientName = String($("clientName")?.value || "").trim();
  if (!dateVal || !clientName){
    toastCard({ title:"Missing info", sub:"Date and Client Name are required.", icon:"⚠️" });
    return;
  }

  const depositVal = Number($("deposit")?.value || 0);
  const payments = [];
  if (depositVal > 0) payments.push({ amount: depositVal, kind:"deposit", note:"" });

  const amounts = Array.from(document.querySelectorAll(".session-amount"));
  const notes = Array.from(document.querySelectorAll(".session-note"));
  amounts.forEach((el,i)=>{
    const val = Number(el.value || 0);
    if (val > 0) payments.push({ amount: val, kind:"session", note: String(notes[i]?.value || "") });
  });

  const data = {
    date: dateVal,
    clientName,
    status: $("status")?.value || "unpaid",
    total: Number($("total")?.value || 0),
    location: $("location")?.value || "",
    description: $("description")?.value || "",
    notes: $("notes")?.value || "",
    payments,
  };

  const nowIso = new Date().toISOString();
  if (editingId){
    const idx = entries.findIndex(e=>e.id===editingId);
    if (idx >= 0) entries[idx] = { ...entries[idx], ...data, updatedAt: nowIso };
  } else {
    entries.push({ id: Date.now(), ...data, createdAt: nowIso, updatedAt: null });
    // badge notification check
    const clients = collectClients();
    const c = clients.find(x=>x.name===clientName);
    if (c && c.badges.length){
      toastCard({ title:"Client updated", sub:`${clientName} • ${c.tattooCount} tattoos • Badge: ${c.badges[c.badges.length-1]}`, icon:"🏷️" });
    }
  }

  saveAll();
  hideModal("formModal");
  render();
}

/* ---------- view / delete ---------- */
function viewEntry(id){
  const entry = entries.find(e=>e.id===id);
  const box = $("viewBox");
  if (!entry || !box) return;

  viewingId = id;
  const dep = depositAmount(entry);
  const paid = paidAmount(entry);

  box.innerHTML = `
    <div class="modal-title">${escapeHtml(entry.clientName)} — ${escapeHtml(entry.date)}</div>

    <div class="row">
      <div style="width:100%;">
        <p><strong>Status:</strong> <span class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${dep > 0 ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
        ${paid > 0 ? `<p><strong>Paid so far:</strong> ${money(paid)}</p>` : ``}
      </div>
      <div style="width:100%;">
        <p><strong>Location:</strong> ${escapeHtml(entry.location || "")}</p>
      </div>
    </div>

    ${entry.description ? `<p><strong>Description:</strong> ${escapeHtml(entry.description)}</p>` : ``}
    ${entry.notes ? `<p><strong>Notes:</strong> ${escapeHtml(entry.notes)}</p>` : ``}

    ${paymentsArray(entry).length ? `
      <h4 style="margin-top:14px;">Payments</h4>
      <ul>
        ${paymentsArray(entry).map(p => `<li>${money(p.amount)} ${p.kind ? `(${escapeHtml(p.kind)})` : ""}${p.note ? ` — ${escapeHtml(p.note)}` : ""}</li>`).join("")}
      </ul>
    ` : ``}

    <div class="actionsRow" style="margin-top:16px;">
      <button type="button" id="btnEditEntry">Edit</button>
      <button type="button" class="dangerbtn" id="btnDeleteEntry">Delete</button>
      <button type="button" class="secondarybtn" id="btnCloseView">Close</button>
    </div>
  `;

  on($("btnEditEntry"),"click",()=>{ hideModal("viewModal"); openForm(entry); });
  on($("btnDeleteEntry"),"click",()=>deleteEntry(id));
  on($("btnCloseView"),"click",()=>hideModal("viewModal"));

  showModal("viewModal");
}

function deleteEntry(id){
  const entry = entries.find(e=>e.id===id);
  if (!entry) return;

  // no confirm() popups — do a toast + soft confirm modal feel
  const box = $("viewBox");
  box.innerHTML += `
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.12);">
      <div style="font-weight:900; color:rgba(255,255,255,.92);">Delete this entry?</div>
      <div class="actionsRow" style="margin-top:10px;">
        <button type="button" class="dangerbtn" id="btnConfirmDelete">Yes, delete</button>
        <button type="button" class="secondarybtn" id="btnCancelDelete">Cancel</button>
      </div>
    </div>
  `;
  on($("btnConfirmDelete"),"click",()=>{
    entries = entries.filter(e=>e.id!==id);
    saveAll();
    hideModal("viewModal");
    render();
    toastCard({ title:"Deleted", sub:`Removed entry for ${entry.clientName}`, icon:"🗑️" });
  });
  on($("btnCancelDelete"),"click",()=>viewEntry(id));
}

/* ---------- quick adds ---------- */
function openBammerQuick(){
  const box = $("bammerBox");
  if (!box) return;

  const today = new Date().toISOString().split("T")[0];
  box.innerHTML = `
    <div class="modal-title">Bammer (quick add)</div>
    <div class="row">
      <input id="bDate" type="date" value="${today}">
      <select id="bStatus">
        <option value="paid">PAID</option>
        <option value="partial">PARTIAL</option>
        <option value="unpaid">UNPAID</option>
      </select>
    </div>
    <div class="row">
      <input id="bClient" placeholder="Client name">
      <input id="bTotal" type="number" placeholder="Total price">
    </div>
    <div class="row">
      <input id="bLocation" placeholder="Location">
      <input id="bDesc" placeholder="Description">
    </div>
    <div class="actionsRow">
      <button type="button" id="btnSaveBammer">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseBammer">Close</button>
    </div>
  `;

  on($("btnSaveBammer"),"click",()=>{
    const date = $("bDate")?.value || "";
    const client = String($("bClient")?.value || "").trim();
    if (!date || !client){
      toastCard({ title:"Missing info", sub:"Date + Client required.", icon:"⚠️" });
      return;
    }
    entries.push({
      id: Date.now(),
      date,
      clientName: client,
      status: $("bStatus")?.value || "paid",
      total: Number($("bTotal")?.value || 0),
      location: $("bLocation")?.value || "",
      description: $("bDesc")?.value || "",
      notes: "",
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    saveAll();
    hideModal("bammerModal");
    render();
    toastCard({ title:"Bammer logged", sub:client, icon:"💥" });
  });

  on($("btnCloseBammer"),"click",()=>hideModal("bammerModal"));
  showModal("bammerModal");
}

function openDepositQuick(){
  const box = $("depositBox");
  if (!box) return;

  const today = new Date().toISOString().split("T")[0];
  box.innerHTML = `
    <div class="modal-title">Deposit (quick add)</div>
    <div class="row">
      <input id="dDate" type="date" value="${today}">
      <input id="dClient" placeholder="Client name">
    </div>
    <div class="row">
      <input id="dDeposit" type="number" placeholder="Deposit amount">
      <input id="dTotal" type="number" placeholder="Total price (optional)">
    </div>
    <div class="row">
      <input id="dLocation" placeholder="Location (optional)">
      <input id="dDesc" placeholder="Description (optional)">
    </div>
    <div class="actionsRow">
      <button type="button" id="btnSaveDeposit">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseDeposit">Close</button>
    </div>
  `;

  on($("btnSaveDeposit"),"click",()=>{
    const date = $("dDate")?.value || "";
    const client = String($("dClient")?.value || "").trim();
    const dep = Number($("dDeposit")?.value || 0);

    if (!date || !client){
      toastCard({ title:"Missing info", sub:"Date + Client required.", icon:"⚠️" });
      return;
    }
    if (!(dep > 0)){
      toastCard({ title:"Missing info", sub:"Deposit must be > 0.", icon:"⚠️" });
      return;
    }

    entries.push({
      id: Date.now(),
      date,
      clientName: client,
      status: "booked",
      total: Number($("dTotal")?.value || 0),
      location: $("dLocation")?.value || "",
      description: $("dDesc")?.value || "",
      notes: "",
      payments: [{ amount: dep, kind:"deposit", note:"" }],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    saveAll();
    hideModal("depositModal");
    render();
    toastCard({ title:"Deposit logged", sub:`${client} • ${money(dep)}`, icon:"💵" });
  });

  on($("btnCloseDeposit"),"click",()=>hideModal("depositModal"));
  showModal("depositModal");
}

/* ---------- clients / profiles ---------- */
function openClients(){
  const box = $("clientsBox");
  if (!box) return;

  const clients = collectClients();

  box.innerHTML = `
    <div class="modal-title">Clients</div>
    <div style="opacity:.85; margin-bottom:10px;">Tap a client to view profile, badges, and discount reminders.</div>

    ${clients.length ? clients.map(c=>{
      const disc = c.bestDiscount ? ` • ${escapeHtml(c.bestDiscount.label)}` : "";
      const booked = c.upcomingBooked ? ` • ${c.upcomingBooked} booked` : "";
      return `
        <div class="entry" data-client="${escapeHtml(c.name)}" style="cursor:pointer;">
          <div>
            <div class="entry-name">${escapeHtml(c.name)} <span class="badge">${escapeHtml(c.badges.slice(-1)[0] || "—")}</span></div>
            <div class="entry-sub">
              <div class="sub-row"><strong>Spent:</strong> ${money(c.totalNet)} (after split)</div>
              <div class="sub-row clamp2">${c.tattooCount} tattoos${disc}${booked}</div>
            </div>
          </div>
          <div class="badge">${money(c.totalGross)}</div>
        </div>
      `;
    }).join("") : `<div style="opacity:.75;">No clients yet.</div>`}

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseClients">Close</button>
    </div>
  `;

  box.querySelectorAll("[data-client]").forEach(card=>{
    on(card,"click",()=>{
      const name = card.getAttribute("data-client");
      hideModal("clientsModal");
      openClientProfile(name);
    });
  });

  on($("btnCloseClients"),"click",()=>hideModal("clientsModal"));
  showModal("clientsModal");
}

function openClientProfile(clientName){
  const box = $("clientBox");
  if (!box) return;

  const clients = collectClients();
  const c = clients.find(x=>x.name===clientName);
  if (!c){
    toastCard({ title:"Not found", sub:"Client profile missing.", icon:"⚠️" });
    return;
  }

  const discount = c.bestDiscount
    ? `${escapeHtml(c.bestDiscount.label)} (${escapeHtml(c.bestDiscount.type)}${c.bestDiscount.type==="percent" ? ` ${c.bestDiscount.value}%` : c.bestDiscount.type==="static" ? ` ${money(c.bestDiscount.value)}` : ""})`
    : "None";

  const reminder = (c.upcomingBooked && c.bestDiscount)
    ? `<div style="margin-top:10px; padding:10px; border-radius:14px; border:1px solid rgba(212,175,55,.22); background:rgba(0,0,0,.22);">
         <strong>Reminder:</strong> This client has a booked appointment — apply discount at checkout.
       </div>`
    : "";

  box.innerHTML = `
    <div class="modal-title">${escapeHtml(c.name)} — Profile</div>

    <div class="row">
      <div style="width:100%;">
        <p><strong>Tattoos:</strong> ${c.tattooCount}</p>
        <p><strong>Badges:</strong> ${c.badges.length ? c.badges.map(b=>`<span class="badge">${escapeHtml(b)}</span>`).join(" ") : "—"}</p>
      </div>
      <div style="width:100%;">
        <p><strong>Spent (after split):</strong> ${money(c.totalNet)}</p>
        <p><strong>Spent (gross):</strong> ${money(c.totalGross)}</p>
      </div>
    </div>

    <p><strong>Best Discount:</strong> ${discount}</p>
    ${reminder}

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" id="btnCloseClient" class="secondarybtn">Close</button>
    </div>
  `;

  on($("btnCloseClient"),"click",()=>hideModal("clientModal"));
  showModal("clientModal");
}

/* ---------- appointments ---------- */
function openAppointments(){
  const box = $("appointmentsBox");
  if (!box) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const booked = entries
    .filter(e => (e.status||"").toLowerCase()==="booked")
    .filter(e => { const d=parseLocalDate(e.date); return d && d>=today; })
    .sort((a,b)=>parseLocalDate(a.date)-parseLocalDate(b.date));

  box.innerHTML = `
    <div class="modal-title">Appointments</div>

    ${booked.length ? booked.map(e=>{
      const dep = depositAmount(e);
      const row2 = [e.location, e.description].filter(Boolean).join(" • ");
      return `
        <div class="entry" data-id="${e.id}" style="cursor:pointer;">
          <div>
            <div class="entry-name">${escapeHtml(e.clientName)} <span class="status booked" style="margin-left:8px;">BOOKED</span></div>
            <div class="entry-sub">
              ${dep>0 ? `<div class="sub-row"><strong>Deposit:</strong> ${money(dep)}</div>` : ``}
              ${row2 ? `<div class="sub-row clamp2">${escapeHtml(row2)}</div>` : ``}
            </div>
          </div>
          <div class="badge">${escapeHtml(e.date)}</div>
        </div>
      `;
    }).join("") : `<div style="opacity:.75; padding: 10px 2px;">No upcoming booked appointments.</div>`}

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseAppts">Close</button>
    </div>
  `;

  box.querySelectorAll("[data-id]").forEach(card=>{
    on(card,"click",()=>{
      const id = Number(card.getAttribute("data-id"));
      hideModal("appointmentsModal");
      viewEntry(id);
    });
  });

  on($("btnCloseAppts"),"click",()=>hideModal("appointmentsModal"));
  showModal("appointmentsModal");
}

/* ---------- studio (split + discount builder) ---------- */
function openStudio(){
  const box = $("studioBox");
  if (!box) return;

  const split = clampPct(studio.splitDefaultPct ?? 60);

  box.innerHTML = `
    <div class="modal-title">Studio</div>

    <div style="opacity:.85; margin-bottom:10px;">
      Split and rewards/discount rules live here.
    </div>

    <div class="row">
      <input id="splitPct" type="number" value="${split}" placeholder="Default split %">
      <button type="button" id="btnSaveStudio">Save</button>
    </div>

    <div style="margin-top:14px; font-weight:900; color: var(--gold);">Discount Rules (by tattoo count)</div>
    <div id="discountList"></div>

    <div class="actionsRow" style="margin-top:10px;">
      <button type="button" id="btnAddDiscount">+ Add discount rule</button>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseStudio">Close</button>
    </div>
  `;

  renderDiscountRules();

  on($("btnSaveStudio"),"click",()=>{
    studio.splitDefaultPct = clampPct($("splitPct")?.value || 60);
    saveAll();
    render();
    toastCard({ title:"Studio saved", sub:`Split set to ${studio.splitDefaultPct}%`, icon:"🏦" });
  });

  on($("btnAddDiscount"),"click",()=>{
    studio.discountRules = Array.isArray(studio.discountRules) ? studio.discountRules : [];
    studio.discountRules.push({ min: 1, type:"percent", value: 5, label:"New Discount" });
    saveAll();
    renderDiscountRules();
    toastCard({ title:"Added discount rule", sub:"Edit it and Save Studio.", icon:"🏷️" });
  });

  on($("btnCloseStudio"),"click",()=>hideModal("studioModal"));
  showModal("studioModal");
}

function renderDiscountRules(){
  const root = $("discountList");
  if (!root) return;
  const rules = Array.isArray(studio.discountRules) ? studio.discountRules : [];
  root.innerHTML = rules.length ? rules.map((r,idx)=>{
    const type = String(r.type||"percent");
    const value = Number(r.value||0);
    const min = Number(r.min||1);
    const label = String(r.label||"Discount");

    return `
      <div class="entry" style="cursor:default;">
        <div style="width:100%;">
          <div class="row" style="margin-top:0;">
            <input data-k="min" data-i="${idx}" type="number" value="${min}" placeholder="Min tattoos">
            <select data-k="type" data-i="${idx}">
              <option value="percent" ${type==="percent"?"selected":""}>Percent</option>
              <option value="static" ${type==="static"?"selected":""}>Static</option>
              <option value="free" ${type==="free"?"selected":""}>Free</option>
            </select>
          </div>
          <div class="row">
            <input data-k="value" data-i="${idx}" type="number" value="${value}" placeholder="Value (percent or $)">
            <input data-k="label" data-i="${idx}" type="text" value="${escapeHtml(label)}" placeholder="Label">
          </div>
          <div class="actionsRow" style="justify-content:flex-end;">
            <button type="button" class="dangerbtn" data-del="${idx}">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join("") : `<div style="opacity:.75; margin-top:8px;">No discount rules yet.</div>`;

  root.querySelectorAll("[data-k]").forEach(el=>{
    on(el,"input",()=>{
      const i = Number(el.getAttribute("data-i"));
      const k = el.getAttribute("data-k");
      if (!studio.discountRules?.[i]) return;
      if (k === "min" || k === "value") studio.discountRules[i][k] = Number(el.value||0);
      else studio.discountRules[i][k] = el.value;
      saveAll();
    });
    on(el,"change",()=>{
      const i = Number(el.getAttribute("data-i"));
      const k = el.getAttribute("data-k");
      if (!studio.discountRules?.[i]) return;
      studio.discountRules[i][k] = el.value;
      saveAll();
    });
  });

  root.querySelectorAll("[data-del]").forEach(btn=>{
    on(btn,"click",()=>{
      const i = Number(btn.getAttribute("data-del"));
      studio.discountRules.splice(i,1);
      saveAll();
      renderDiscountRules();
    });
  });
}

/* ---------- export ---------- */
function openExport(){
  const box = $("exportBox");
  if (!box) return;

  const rows = entries.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const csv = [
    ["date","client","status","total","paid_so_far","deposit","location","description"].join(","),
    ...rows.map(e => [
      e.date,
      `"${String(e.clientName||"").replaceAll('"','""')}"`,
      e.status,
      Number(e.total||0),
      Number(paidAmount(e)||0),
      Number(depositAmount(e)||0),
      `"${String(e.location||"").replaceAll('"','""')}"`,
      `"${String(e.description||"").replaceAll('"','""')}"`
    ].join(","))
  ].join("\n");

  box.innerHTML = `
    <div class="modal-title">Export</div>
    <div style="opacity:.85; margin-bottom:10px;">Copy CSV below.</div>
    <textarea id="csvBox" style="min-height:220px;">${escapeHtml(csv)}</textarea>

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" id="btnCopyCsv">Copy</button>
      <button type="button" class="secondarybtn" id="btnCloseExport">Close</button>
    </div>
  `;

  on($("btnCopyCsv"),"click",async ()=>{
    const t = $("csvBox");
    if (!t) return;
    t.select();
    try{
      await navigator.clipboard.writeText(t.value);
      toastCard({ title:"Copied", sub:"CSV copied to clipboard.", icon:"📋" });
    } catch {
      toastCard({ title:"Copy failed", sub:"Your browser blocked clipboard. Long-press to copy.", icon:"⚠️" });
    }
  });

  on($("btnCloseExport"),"click",()=>hideModal("exportModal"));
  showModal("exportModal");
}

/* ---------- FAB fix (no double fire + no dead taps) ---------- */
let lastFabAt = 0;
function canFireFab(){
  const now = Date.now();
  if (now - lastFabAt < 320) return false; // blocks double-trigger
  lastFabAt = now;
  return true;
}
function installFab(){
  const add = $("fabAdd");
  const dep = $("fabDeposit");
  const bam = $("fabBammer");

  // normal clicks
  on(add,"click",(e)=>{ e.preventDefault(); e.stopPropagation(); if (canFireFab()) openForm(null); });
  on(dep,"click",(e)=>{ e.preventDefault(); e.stopPropagation(); if (canFireFab()) openDepositQuick(); });
  on(bam,"click",(e)=>{ e.preventDefault(); e.stopPropagation(); if (canFireFab()) openBammerQuick(); });

  // capture-phase pointerdown to beat overlays
  document.addEventListener("pointerdown",(e)=>{
    // only act if tap is actually inside the buttons
    const t = e.target;
    if (t === add || add?.contains(t) || t === dep || dep?.contains(t) || t === bam || bam?.contains(t)){
      e.preventDefault();
      e.stopPropagation();
      if (!canFireFab()) return;
      if (t === dep || dep?.contains(t)) openDepositQuick();
      else if (t === bam || bam?.contains(t)) openBammerQuick();
      else openForm(null);
    }
  }, true);
}

/* ---------- init ---------- */
function init(){
  wireModalClickOff("formModal","formBox");
  wireModalClickOff("viewModal","viewBox");
  wireModalClickOff("exportModal","exportBox");
  wireModalClickOff("bammerModal","bammerBox");
  wireModalClickOff("depositModal","depositBox");
  wireModalClickOff("clientsModal","clientsBox");
  wireModalClickOff("clientModal","clientBox");
  wireModalClickOff("studioModal","studioBox");
  wireModalClickOff("appointmentsModal","appointmentsBox");

  initLogo();

  on($("filtersHeader"),"click",toggleFilters);
  on($("q"),"keydown",(e)=>{ if(e.key==="Enter") applyFilters(); });

  installFab();

  render();
  toastCard({ title:"Loaded", sub:`Stable build • ${APP_VERSION}`, icon:"✅" });
}

document.addEventListener("DOMContentLoaded", init);

/* ---------- expose globals (for onclick in HTML) ---------- */
window.openForm = openForm;
window.openDepositQuick = openDepositQuick;
window.openBammerQuick = openBammerQuick;
window.openAppointments = openAppointments;
window.openStudio = openStudio;
window.openExport = openExport;
window.openClients = openClients;
window.toggleFilters = toggleFilters;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.viewEntry = viewEntry;