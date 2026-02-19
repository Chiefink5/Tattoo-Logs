// ================= STATE =================
let entries = JSON.parse(localStorage.getItem("entries") || "[]");
let editingId = null;

// Payday: 0=Sun..6=Sat
let payday = Number(localStorage.getItem("payday") || 0);

// ================= HELPERS =================
function money(n){ return "$" + (Number(n || 0)); }

function paidAmount(entry){
  return (entry.payments || []).reduce((sum,p)=>sum + Number(p.amount || 0), 0);
}

function safeEl(id){ return document.getElementById(id); }
function safeVal(id){ const el = safeEl(id); return el ? el.value : ""; }

function monthName(year, monthIndex){
  return new Date(year, monthIndex, 1).toLocaleString("default",{month:"long"});
}

function pad2(n){ return String(n).padStart(2,"0"); }

// YYYY-MM-DD -> Date at local midnight
function parseLocalDate(dateStr){
  const parts = String(dateStr || "").split("-");
  if(parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0,0,0,0);
  return dt;
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

if (formModal){
  formModal.addEventListener("click", (e)=>{ if(e.target===formModal) closeForm(); });
}
if (viewModal){
  viewModal.addEventListener("click", (e)=>{ if(e.target===viewModal) closeView(); });
}
if (exportModal){
  exportModal.addEventListener("click", (e)=>{ if(e.target===exportModal) closeExport(); });
}
if (formBox) formBox.addEventListener("click", (e)=> e.stopPropagation());
if (viewBox) viewBox.addEventListener("click", (e)=> e.stopPropagation());
if (exportBox) exportBox.addEventListener("click", (e)=> e.stopPropagation());

// ================= EXPORT MODAL =================
function openExport(){
  if(!exportModal) return;

  const paydaySelect = safeEl("paydaySelect");
  if(paydaySelect) paydaySelect.value = String(payday);

  // Default date range: current month
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth()+1, 0);

  const exportStart = safeEl("exportStart");
  const exportEnd = safeEl("exportEnd");

  if(exportStart) exportStart.value = `${start.getFullYear()}-${pad2(start.getMonth()+1)}-${pad2(start.getDate())}`;
  if(exportEnd) exportEnd.value = `${end.getFullYear()}-${pad2(end.getMonth()+1)}-${pad2(end.getDate())}`;

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
    updateStats();
  });
})();

// ================= FORM =================
function openForm(){
  editingId = null;
  const title = safeEl("formTitle");
  if(title) title.textContent = "Add Entry";

  if (!formModal) return;
  formModal.style.display="flex";

  const dateEl = safeEl("date");
  if(dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  // Default status
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

  const set = (id, val) => { const el = safeEl(id); if(el) el.value = val ?? ""; };

  set("date", entry.date);
  set("client", entry.client);
  set("contact", entry.contact || "");
  set("social", entry.social || "");
  set("description", entry.description || "");
  set("location", entry.location || "");
  set("notes", entry.notes || "");
  set("total", entry.total ?? 0);
  set("status", entry.status || "unpaid");

  // Rebuild payments into deposit + sessions UI
  const sessions = safeEl("sessions");
  if(sessions) sessions.innerHTML = "";

  let deposit = 0;
  const sessionPays = [];

  (entry.payments || []).forEach(p=>{
    if(p.kind === "deposit") deposit += Number(p.amount || 0);
    else sessionPays.push(p);
  });

  set("deposit", deposit);

  sessionPays.forEach(p=>{
    addSession();
    const amounts = document.querySelectorAll(".session-amount");
    const notes = document.querySelectorAll(".session-note");
    const idx = amounts.length - 1;
    if(amounts[idx]) amounts[idx].value = Number(p.amount || 0);
    if(notes[idx]) notes[idx].value = p.note || "";
  });

  // image input cannot be prefilled in browsers (security)
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

  const applyAndSave = (imageDataUrlOrNull, keepOldImageIfNull)=>{
    if(editingId){
      const idx = entries.findIndex(e=>e.id===editingId);
      if(idx === -1){ closeForm(); return; }

      const old = entries[idx];
      const next = Object.assign({}, old, base);

      if(imageDataUrlOrNull){
        next.image = imageDataUrlOrNull;
      } else if(!keepOldImageIfNull){
        next.image = null;
      } // else keep old image

      // simple edit log
      next.updatedAt = new Date().toISOString();
      if(!Array.isArray(next.editHistory)) next.editHistory = [];
      next.editHistory.push({ timestamp: next.updatedAt, action: "edited" });

      entries[idx] = next;
      save();
      closeForm();
    } else {
      const entry = Object.assign({}, base, {
        id: Date.now(),
        image: imageDataUrlOrNull || null,
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
    reader.onload = (e)=> applyAndSave(e.target.result, true);
    reader.readAsDataURL(file);
  } else {
    // On edit: keep old image if user didn’t pick a new one
    applyAndSave(null, true);
  }
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

// ================= VIEW / EDIT / DELETE =================
let viewingId = null;

function viewEntry(id){
  const entry = entries.find(e=>e.id===id);
  if(!entry || !viewBox) return;

  viewingId = id;

  const paid = paidAmount(entry);
  const remaining = Number(entry.total || 0) - paid;

  viewBox.innerHTML = `
    <h3 style="margin-top:0;">${entry.client}</h3>
    <p><strong>Date:</strong> ${entry.date}</p>
    <p><strong>Status:</strong> <span class="status ${entry.status}">${entry.status}</span></p>

    <div class="row">
      <div>
        <p><strong>Total:</strong> ${money(entry.total)}</p>
        <p><strong>Paid:</strong> ${money(paid)}</p>
        <p><strong>Remaining:</strong> ${money(remaining)}</p>
      </div>
      <div>
        <p><strong>Contact:</strong> ${entry.contact || ""}</p>
        <p><strong>Social:</strong> ${entry.social || ""}</p>
      </div>
    </div>

    <p><strong>Location:</strong> ${entry.location || ""}</p>
    <p><strong>Description:</strong> ${entry.description || ""}</p>
    <p><strong>Notes:</strong> ${entry.notes || ""}</p>

    <h4>Payments</h4>
    ${
      (entry.payments || []).length
        ? `<ul>${entry.payments.map(p=>`<li>${money(p.amount)} ${p.kind ? `(${p.kind})` : ""} ${p.note ? `— ${p.note}` : ""}</li>`).join("")}</ul>`
        : "<p style='opacity:.7;'>No payments recorded.</p>"
    }

    ${entry.image ? `<img src="${entry.image}" style="width:100%; margin-top:10px; border-radius:10px; border:1px solid rgba(212,175,55,.25);">` : ""}

    <div class="actions-row">
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

// ================= STATS (Payday-aligned Week) =================
function getWeekWindow(now){
  // Start of current week = most recent payday (including today if it matches)
  const currentDay = now.getDay(); // 0..6
  const diffToPayday = (currentDay - payday + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - diffToPayday);
  start.setHours(0,0,0,0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);

  return { start, end };
}

function updateStats(){
  const todayEl = safeEl("todayTotal");
  const weekEl = safeEl("weekTotal");
  const monthEl = safeEl("monthTotal");
  const yearEl = safeEl("yearTotal");
  if(!todayEl) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindow(now);

  let today=0, week=0, month=0, year=0;

  entries.forEach(entry=>{
    const paid = paidAmount(entry);
    const d = parseLocalDate(entry.date);
    if(!d) return;

    if(entry.date === todayStr) today += paid;
    if(d.getFullYear() === now.getFullYear()) year += paid;
    if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += paid;

    if(d >= weekWin.start && d <= weekWin.end) week += paid;
  });

  todayEl.innerText = money(today);
  if(weekEl) weekEl.innerText = money(week);
  if(monthEl) monthEl.innerText = money(month);
  if(yearEl) yearEl.innerText = money(year);
}

// ================= CSV EXPORT =================
function csvEscape(v){
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
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

  const rows = [];
  rows.push([
    "date","client","contact","social","description","location",
    "total","paid","remaining","status","notes"
  ]);

  entries.forEach(e=>{
    const d = parseLocalDate(e.date);
    if(!d) return;
    if(d < start || d > end) return;

    const paid = paidAmount(e);
    const total = Number(e.total || 0);
    const remaining = total - paid;

    rows.push([
      e.date,
      e.client,
      e.contact || "",
      e.social || "",
      e.description || "",
      e.location || "",
      total,
      paid,
      remaining,
      e.status || "",
      e.notes || ""
    ]);
  });

  const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tattoo-tracker_${startStr}_to_${endStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  // Group: year -> monthIndex -> dayNumber -> [entries]
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
    const yearPaid = Object.values(grouped[year])
      .flatMap(mo=>Object.values(mo).flat())
      .reduce((sum,e)=>sum + paidAmount(e), 0);

    const yearAcc = createAccordion(String(year), money(yearPaid));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx=>{
      const monthPaid = Object.values(grouped[year][monthIdx])
        .flat()
        .reduce((sum,e)=>sum + paidAmount(e), 0);

      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthPaid));
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum=>{
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayPaid = dayEntries.reduce((sum,e)=>sum + paidAmount(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx)+1)}-${pad2(dayNum)}`;
        const dayAcc = createAccordion(dateLabel, money(dayPaid));
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries
          .slice()
          .sort((a,b)=>b.id - a.id)
          .forEach(entry=>{
            const paid = paidAmount(entry);

            const row = document.createElement("div");
            row.className = "entry";
            row.innerHTML = `
              <div class="entry-left">
                <div class="entry-name">${entry.client}</div>
                <div class="entry-sub">${money(paid)} / ${money(entry.total)} ${entry.location ? "• " + entry.location : ""}</div>
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

// ================= INIT =================
render();