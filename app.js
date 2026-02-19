// ================= STATE =================
let entries = JSON.parse(localStorage.getItem("entries") || "[]");
let editingId = null;
let viewingId = null;

// Payday: 0=Sun..6=Sat
let payday = Number(localStorage.getItem("payday") || 0);

// Export pay period anchor (start date of the shown pay period)
let payPeriodAnchor = null;

// ================= HELPERS =================
function money(n){ return "$" + (Number(n || 0)); }
function pad2(n){ return String(n).padStart(2,"0"); }

function safeEl(id){ return document.getElementById(id); }
function safeVal(id){ const el = safeEl(id); return el ? el.value : ""; }

function monthName(year, monthIndex){
  return new Date(year, monthIndex, 1).toLocaleString("default",{month:"long"});
}

// YYYY-MM-DD -> local midnight Date
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

function paymentsArray(entry){
  return Array.isArray(entry.payments) ? entry.payments : [];
}

function paidAmount(entry){
  // deposit + sessions
  return paymentsArray(entry).reduce((sum,p)=>sum + Number(p.amount || 0), 0);
}

function depositAmount(entry){
  return paymentsArray(entry)
    .filter(p => p.kind === "deposit")
    .reduce((sum,p)=>sum + Number(p.amount || 0), 0);
}

function hasAnyPayments(entry){
  return paidAmount(entry) > 0;
}

function currentQuarterIndex(dateObj){
  return Math.floor(dateObj.getMonth() / 3); // 0..3
}

// Totals logic (dashboard/exports)
function totalForTotals(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if(status === "paid") return Number(entry.total || 0);
  if(status === "partial") return paidAmount(entry);
  return 0;
}

// For the preview “Paid: $X” line
function paidForPreview(entry){
  const status = (entry.status || "unpaid").toLowerCase();
  if(status === "paid") return Number(entry.total || 0);
  if(status === "partial") return paidAmount(entry);
  return 0;
}

// ================= SAVE =================
function save(){
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}

// ================= MODALS (click off to close) =================
const formModal = safeEl("formModal");
const formBox = safeEl("formBox");
const viewModal = safeEl("viewModal");
const viewBox = safeEl("viewBox");
const exportModal = safeEl("exportModal");
const exportBox = safeEl("exportBox");

if (formModal) formModal.addEventListener("click", (e)=>{ if(e.target===formModal) closeForm(); });
if (viewModal) viewModal.addEventListener("click", (e)=>{ if(e.target===viewModal) closeView(); });
if (exportModal) exportModal.addEventListener("click", (e)=>{ if(e.target===exportModal) closeExport(); });

if (formBox) formBox.addEventListener("click", (e)=> e.stopPropagation());
if (viewBox) viewBox.addEventListener("click", (e)=> e.stopPropagation());
if (exportBox) exportBox.addEventListener("click", (e)=> e.stopPropagation());

// ================= LOGO (editable PNG) =================
function initLogo(){
  const img = safeEl("logoImg");
  const input = safeEl("logoInput");
  if(!img || !input) return;

  const saved = localStorage.getItem("logoDataUrl");
  if(saved){
    img.src = saved;
  } else {
    // default tiny placeholder look
    img.src = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" rx="12" fill="#16201b"/>
        <text x="50%" y="56%" text-anchor="middle" font-family="Inter" font-size="28" fill="#d4af37">G</text>
      </svg>
    `);
  }

  img.addEventListener("click", ()=> input.click());

  input.addEventListener("change", ()=>{
    const file = input.files && input.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (e)=>{
      const dataUrl = e.target.result;
      localStorage.setItem("logoDataUrl", dataUrl);
      img.src = dataUrl;
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
}
initLogo();

// ================= PAYDAY WEEK WINDOW =================
function getWeekWindowFromDate(anchorDate){
  const now = new Date(anchorDate);
  const currentDay = now.getDay();
  const diffToPayday = (currentDay - payday + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - diffToPayday);
  start.setHours(0,0,0,0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);

  return { start, end };
}

function getWeekWindow(now){
  return getWeekWindowFromDate(now);
}

// ================= EXPORT MODAL =================
function openExport(){
  if(!exportModal) return;

  const paydaySelect = safeEl("paydaySelect");
  if(paydaySelect) paydaySelect.value = String(payday);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

  const exportStart = safeEl("exportStart");
  const exportEnd = safeEl("exportEnd");
  if(exportStart) exportStart.value = formatYYYYMMDD(start);
  if(exportEnd) exportEnd.value = formatYYYYMMDD(end);

  const w = getWeekWindow(now);
  payPeriodAnchor = new Date(w.start);
  updatePayPeriodUI();

  const summaryOut = safeEl("summaryOut");
  if(summaryOut) summaryOut.innerHTML = "";

  exportModal.style.display = "flex";
}

function closeExport(){
  if(!exportModal) return;
  exportModal.style.display = "none";
}

(function initPaydaySelect(){
  const paydaySelect = safeEl("paydaySelect");
  if(!paydaySelect) return;

  paydaySelect.value = String(payday);
  paydaySelect.addEventListener("change", function(){
    payday = Number(this.value);
    localStorage.setItem("payday", String(payday));

    const base = payPeriodAnchor ? new Date(payPeriodAnchor) : new Date();
    const w = getWeekWindowFromDate(base);
    payPeriodAnchor = new Date(w.start);
    updatePayPeriodUI();

    updateStats();
  });
})();

function updatePayPeriodUI(){
  const ppStart = safeEl("ppStart");
  const ppEnd = safeEl("ppEnd");
  if(!ppStart || !ppEnd) return;

  const anchor = payPeriodAnchor ? new Date(payPeriodAnchor) : new Date();
  const w = getWeekWindowFromDate(anchor);
  ppStart.value = formatYYYYMMDD(w.start);
  ppEnd.value = formatYYYYMMDD(w.end);
}

function prevPayPeriod(){
  if(!payPeriodAnchor) payPeriodAnchor = new Date();
  const d = new Date(payPeriodAnchor);
  d.setDate(d.getDate() - 7);
  payPeriodAnchor = d;
  updatePayPeriodUI();
}

function nextPayPeriod(){
  if(!payPeriodAnchor) payPeriodAnchor = new Date();
  const d = new Date(payPeriodAnchor);
  d.setDate(d.getDate() + 7);
  payPeriodAnchor = d;
  updatePayPeriodUI();
}

// ================= FORM =================
function openForm(){
  editingId = null;
  const title = safeEl("formTitle");
  if(title) title.textContent = "Add Entry";

  if (!formModal) return;
  formModal.style.display="flex";

  const dateEl = safeEl("date");
  if(dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  const statusEl = safeEl("status");
  if(statusEl) statusEl.value = "unpaid";
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
    <input type="number" class="session-amount" placeholder="Session Amount">
    <input type="text" class="session-note" placeholder="Session Note (optional)">
  `;
  container.appendChild(row);
}

function fillFormForEdit(entry){
  editingId = entry.id;

  const title = safeEl("formTitle");
  if(title) title.textContent = "Edit Entry";

  if(!formModal) return;
  formModal.style.display = "flex";

  const set = (id, val) => { const el = safeEl(id); if(el) el.value = (val === undefined || val === null) ? "" : val; };

  set("date", entry.date);
  set("client", entry.client);
  set("contact", entry.contact || "");
  set("social", entry.social || "");
  set("description", entry.description || "");
  set("location", entry.location || "");
  set("notes", entry.notes || "");
  set("total", entry.total ?? 0);
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

// ================= EDIT HISTORY (diff logger) =================
function diffFields(oldEntry, newEntry){
  const fields = ["date","client","contact","social","description","location","notes","total","status"];
  const changes = [];

  for(const f of fields){
    const oldV = (oldEntry[f] === undefined || oldEntry[f] === null) ? "" : oldEntry[f];
    const newV = (newEntry[f] === undefined || newEntry[f] === null) ? "" : newEntry[f];
    if(String(oldV) !== String(newV)){
      changes.push({ field:f, oldValue:oldV, newValue:newV });
    }
  }

  const oldPaid = paidAmount(oldEntry);
  const newPaid = paidAmount(newEntry);
  const oldDep = depositAmount(oldEntry);
  const newDep = depositAmount(newEntry);

  if(oldPaid !== newPaid || oldDep !== newDep){
    changes.push({
      field:"payments",
      oldValue:`paidSoFar=${oldPaid}, deposit=${oldDep}`,
      newValue:`paidSoFar=${newPaid}, deposit=${newDep}`
    });
  }

  const oldHas = !!oldEntry.image;
  const newHas = !!newEntry.image;
  if(oldHas !== newHas){
    changes.push({ field:"image", oldValue: oldHas ? "has image" : "no image", newValue: newHas ? "has image" : "no image" });
  }

  return changes;
}

// ================= ENTRY SAVE (ADD/EDIT) =================
function saveEntry(){
  const dateVal = safeVal("date");
  const clientVal = safeVal("client").trim();
  if(!dateVal || !clientVal){
    alert("Date and Client Name are required.");
    return;
  }

  const payments = [];

  const depositVal = Number(safeVal("deposit") || 0);
  if(depositVal > 0){
    payments.push({ amount: depositVal, kind: "deposit" });
  }

  const sessionAmounts = document.querySelectorAll(".session-amount");
  const sessionNotes = document.querySelectorAll(".session-note");

  sessionAmounts.forEach((input, i)=>{
    const val = Number(input.value || 0);
    if(val > 0){
      payments.push({
        amount: val,
        kind: "session",
        note: sessionNotes[i] ? (sessionNotes[i].value || "") : ""
      });
    }
  });

  const base = {
    date: dateVal,
    client: clientVal,
    contact: safeVal("contact"),
    social: safeVal("social"),
    description: safeVal("description"),
    location: safeVal("location"),
    notes: safeVal("notes"),
    total: Number(safeVal("total") || 0),
    payments,
    status: safeVal("status") || "unpaid"
  };

  const imageEl = safeEl("image");
  const file = imageEl && imageEl.files ? imageEl.files[0] : null;

  const applyAndSave = (newImageDataUrlOrNull)=>{
    if(editingId){
      const idx = entries.findIndex(e=>e.id===editingId);
      if(idx === -1){ closeForm(); return; }

      const old = entries[idx];
      const next = Object.assign({}, old, base);

      next.image = newImageDataUrlOrNull ? newImageDataUrlOrNull : (old.image || null);

      const ts = new Date().toISOString();
      if(!Array.isArray(next.editHistory)) next.editHistory = [];
      const changes = diffFields(old, next);
      next.editHistory.push({ timestamp: ts, changes: changes.length ? changes : [{ field:"(no changes)", oldValue:"", newValue:"" }] });
      next.updatedAt = ts;

      entries[idx] = next;
      save();
      closeForm();
    } else {
      const entry = Object.assign({}, base, {
        id: Date.now(),
        image: newImageDataUrlOrNull || null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        editHistory: []
      });
      entries.push(entry);
      save();
      closeForm();
    }
  };

  if(file){
    const reader = new FileReader();
    reader.onload = (e)=> applyAndSave(e.target.result);
    reader.readAsDataURL(file);
  } else {
    applyAndSave(null);
  }
}

// ================= VIEW / EDIT / DELETE =================
function viewEntry(id){
  const entry = entries.find(e=>e.id===id);
  if(!entry || !viewBox) return;

  viewingId = id;

  const paidSoFar = paidAmount(entry);
  const dep = depositAmount(entry);
  const remaining = Number(entry.total || 0) - paidSoFar;
  const counts = totalForTotals(entry);

  const showMoneyDetails = hasAnyPayments(entry); // ONLY if user filled payments (deposit/sessions)

  let historyHtml = "<p style='opacity:.7;'>No edits yet.</p>";
  if(Array.isArray(entry.editHistory) && entry.editHistory.length){
    historyHtml = entry.editHistory
      .slice()
      .reverse()
      .map(h=>{
        const list = (h.changes || []).map(c=>{
          return `<li><strong>${c.field}:</strong> "${String(c.oldValue)}" → "${String(c.newValue)}"</li>`;
        }).join("");
        return `<div style="margin-top:10px;">
          <div style="opacity:.85;"><strong>${h.timestamp}</strong></div>
          <ul style="margin:6px 0 0 18px;">${list}</ul>
        </div>`;
      }).join("");
  }

  viewBox.innerHTML = `
    <div class="modal-title">${entry.client} — ${entry.date}</div>

    <div class="row">
      <div>
        <p><strong>Status:</strong> <span class="status ${entry.status}">${entry.status}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${showMoneyDetails ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
      </div>
      <div>
        <p><strong>Location:</strong> ${entry.location || ""}</p>
      </div>
    </div>

    <hr>

    <p><strong>Description:</strong> ${entry.description || ""}</p>
    <p><strong>Contact:</strong> ${entry.contact || ""}</p>
    <p><strong>Social:</strong> ${entry.social || ""}</p>
    <p><strong>Notes:</strong> ${entry.notes || ""}</p>

    ${showMoneyDetails ? `
      <h4>Payments</h4>
      ${
        paymentsArray(entry).length
          ? `<ul>${paymentsArray(entry).map(p=>`<li>${money(p.amount)} ${p.kind ? `(${p.kind})` : ""} ${p.note ? `— ${p.note}` : ""}</li>`).join("")}</ul>`
          : "<p style='opacity:.7;'>No payments recorded.</p>"
      }

      <details style="margin-top:12px;">
        <summary>More details</summary>
        <div style="margin-top:10px;">
          <p><strong>Paid So Far:</strong> ${money(paidSoFar)}</p>
          <p><strong>Remaining:</strong> ${money(remaining)}</p>
          <p><strong>Counts Toward Totals:</strong> ${money(counts)}</p>
        </div>
      </details>
    ` : ``}

    ${entry.image ? `<img src="${entry.image}" style="width:100%; margin-top:15px; border-radius:12px; border:1px solid rgba(212,175,55,.3);">` : ""}

    <details style="margin-top:12px;">
      <summary>Edit History</summary>
      ${historyHtml}
    </details>

    <div class="actions-row" style="margin-top:20px;">
      <button type="button" onclick="editFromView()">Edit</button>
      <button type="button" class="dangerbtn" onclick="deleteFromView()">Delete</button>
      <button type="button" class="secondarybtn" onclick="closeView()">Close</button>
    </div>
  `;

  if(viewModal) viewModal.style.display = "flex";
}

function closeView(){
  if(!viewModal) return;
  viewModal.style.display="none";
  viewingId = null;
}

function editFromView(){
  if(!viewingId) return;
  const entry = entries.find(e=>e.id===viewingId);
  if(!entry) return;
  closeView();
  fillFormForEdit(entry);
}

function deleteFromView(){
  if(!viewingId) return;
  const entry = entries.find(e=>e.id===viewingId);
  if(!entry) return;

  const ok = confirm(`Delete entry for ${entry.client} on ${entry.date}?`);
  if(!ok) return;

  entries = entries.filter(e=>e.id!==viewingId);
  save();
  closeView();
}

// ================= STATS =================
function updateStats(){
  const todayEl = safeEl("todayTotal");
  const weekEl = safeEl("weekTotal");
  const monthEl = safeEl("monthTotal");
  const quarterEl = safeEl("quarterTotal");
  const yearEl = safeEl("yearTotal");
  if(!todayEl) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindow(now);
  const qNow = currentQuarterIndex(now);

  let today=0, week=0, month=0, quarter=0, year=0;

  entries.forEach(entry=>{
    const amt = totalForTotals(entry);
    const d = parseLocalDate(entry.date);
    if(!d) return;

    if(entry.date === todayStr) today += amt;

    if(d.getFullYear() === now.getFullYear()){
      year += amt;
      if(currentQuarterIndex(d) === qNow) quarter += amt;
    }

    if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()){
      month += amt;
    }

    if(d >= weekWin.start && d <= weekWin.end){
      week += amt;
    }
  });

  todayEl.innerText = money(today);
  if(weekEl) weekEl.innerText = money(week);
  if(monthEl) monthEl.innerText = money(month);
  if(quarterEl) quarterEl.innerText = money(quarter);
  if(yearEl) yearEl.innerText = money(year);
}

// ================= CSV EXPORT =================
function csvEscape(v){
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function downloadCSV(rows, filename){
  const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV(){
  const startStr = safeVal("exportStart");
  const endStr = safeVal("exportEnd");
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);

  if(!start || !end){
    alert("Pick a start and end date.");
    return;
  }
  if(end < start){
    alert("End date must be after start date.");
    return;
  }

  exportRangeCSV(start, end, `ink-log_${startStr}_to_${endStr}.csv`);
}

function exportPayPeriodCSV(){
  const ppStartStr = safeVal("ppStart");
  const ppEndStr = safeVal("ppEnd");
  const start = parseLocalDate(ppStartStr);
  const end = parseLocalDate(ppEndStr);
  if(!start || !end){
    alert("Pay period dates missing.");
    return;
  }
  exportRangeCSV(start, end, `pay_period_${ppStartStr}_to_${ppEndStr}.csv`);
}

function exportRangeCSV(start, end, filename){
  const rows = [];
  rows.push([
    "date","client","contact","social","description","location",
    "total_price","paid_so_far","deposit","counts_toward_totals","remaining","status","notes"
  ]);

  entries.forEach(e=>{
    const d = parseLocalDate(e.date);
    if(!d) return;
    if(d < start || d > end) return;

    const paidSoFar = paidAmount(e);
    const dep = depositAmount(e);
    const total = Number(e.total || 0);
    const remaining = total - paidSoFar;
    const counts = totalForTotals(e);

    rows.push([
      e.date,
      e.client,
      e.contact || "",
      e.social || "",
      e.description || "",
      e.location || "",
      total,
      paidSoFar,
      dep,
      counts,
      remaining,
      e.status || "",
      e.notes || ""
    ]);
  });

  downloadCSV(rows, filename);
}

// ================= EXPORT SUMMARY =================
function buildSummary(mode){
  let start = null;
  let end = null;
  let title = "";

  if(mode === "payperiod"){
    const s = parseLocalDate(safeVal("ppStart"));
    const e = parseLocalDate(safeVal("ppEnd"));
    if(!s || !e){ alert("Pay period dates missing."); return; }
    start = s; end = e;
    title = `Pay Period Summary (${safeVal("ppStart")} → ${safeVal("ppEnd")})`;
  } else {
    const s = parseLocalDate(safeVal("exportStart"));
    const e = parseLocalDate(safeVal("exportEnd"));
    if(!s || !e){ alert("Pick start/end dates."); return; }
    if(e < s){ alert("End date must be after start date."); return; }
    start = s; end = e;
    title = `Date Range Summary (${safeVal("exportStart")} → ${safeVal("exportEnd")})`;
  }

  const filtered = entries.filter(e=>{
    const d = parseLocalDate(e.date);
    if(!d) return false;
    return d >= start && d <= end;
  });

  const totalCount = filtered.length;
  let totalTotalsRule = 0;

  const statusCounts = { paid:0, partial:0, unpaid:0, no_show:0 };
  const clientTotals = {};
  const locationTotals = {};

  filtered.forEach(e=>{
    const s = (e.status || "unpaid").toLowerCase();
    if(statusCounts[s] !== undefined) statusCounts[s]++;

    const counts = totalForTotals(e);
    totalTotalsRule += counts;

    const c = (e.client || "Unknown").trim() || "Unknown";
    clientTotals[c] = (clientTotals[c] || 0) + counts;

    const loc = (e.location || "Unknown").trim() || "Unknown";
    locationTotals[loc] = (locationTotals[loc] || 0) + counts;
  });

  function topN(obj, n){
    return Object.entries(obj)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,n);
  }

  const topClients = topN(clientTotals, 5);
  const topLocs = topN(locationTotals, 5);

  const out = safeEl("summaryOut");
  if(!out) return;

  out.innerHTML = `
    <div style="font-weight:800; color: var(--gold); margin-bottom:8px;">${title}</div>

    <div class="summary-grid">
      <div class="summary-box">
        <div style="font-weight:800;">Totals</div>
        <div>Entries: <strong>${totalCount}</strong></div>
        <div>Total: <strong>${money(totalTotalsRule)}</strong></div>
      </div>

      <div class="summary-box">
        <div style="font-weight:800;">Status Counts</div>
        <div>PAID: <strong>${statusCounts.paid}</strong></div>
        <div>PARTIAL: <strong>${statusCounts.partial}</strong></div>
        <div>UNPAID: <strong>${statusCounts.unpaid}</strong></div>
        <div>NO SHOW: <strong>${statusCounts.no_show}</strong></div>
      </div>
    </div>

    <div class="summary-grid" style="margin-top:10px;">
      <div class="summary-box">
        <div style="font-weight:800;">Top Clients</div>
        ${topClients.length ? `<ol style="margin:8px 0 0 18px;">${topClients.map(([k,v])=>`<li>${k}: <strong>${money(v)}</strong></li>`).join("")}</ol>` : "<div style='opacity:.75;'>None</div>"}
      </div>

      <div class="summary-box">
        <div style="font-weight:800;">Top Locations</div>
        ${topLocs.length ? `<ol style="margin:8px 0 0 18px;">${topLocs.map(([k,v])=>`<li>${k}: <strong>${money(v)}</strong></li>`).join("")}</ol>` : "<div style='opacity:.75;'>None</div>"}
      </div>
    </div>
  `;
}

// ================= RENDER (Year → Month → Day → Entries) =================
function render(){
  const container = safeEl("entries");
  if(!container) return;

  container.innerHTML = "";

  if(entries.length === 0){
    container.innerHTML = "<p style='opacity:.65;'>No entries yet.</p>";
    updateStats();
    return;
  }

  const grouped = {};

  entries.forEach(e=>{
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
    const yearAmt = Object.values(grouped[year])
      .flatMap(mo=>Object.values(mo).flat())
      .reduce((sum,e)=>sum + totalForTotals(e), 0);

    const yearAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx=>{
      const monthAmt = Object.values(grouped[year][monthIdx])
        .flat()
        .reduce((sum,e)=>sum + totalForTotals(e), 0);

      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmt));
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum=>{
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmt = dayEntries.reduce((sum,e)=>sum + totalForTotals(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx)+1)}-${pad2(dayNum)}`;
        const dayAcc = createAccordion(dateLabel, money(dayAmt));
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries
          .slice()
          .sort((a,b)=>b.id - a.id)
          .forEach(entry=>{
            const paidLine = money(paidForPreview(entry));
            const loc = (entry.location || "").trim();
            const desc = (entry.description || "").trim();
            const row2 = [loc, desc].filter(Boolean).join(" • ");

            const row = document.createElement("div");
            row.className = "entry";
            row.innerHTML = `
              <div class="entry-left">
                <div class="entry-name">${entry.client}</div>
                <div class="entry-sub">
                  <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                  <div class="sub-row">${row2 || ""}</div>
                </div>
              </div>
              <div class="status ${entry.status}">${entry.status}</div>
            `;
            row.addEventListener("click", ()=>viewEntry(entry.id));
            dayAcc.content.appendChild(row);
          });
      });
    });
  });

  updateStats();
}

// ================= ACCORDION UI =================
function createAccordion(title, badgeText){
  const wrap = document.createElement("div");
  wrap.className = "accordion";

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

// ================= INIT =================
render();