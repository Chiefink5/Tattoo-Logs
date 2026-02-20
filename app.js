/* =========================================================
   Globber’s Ink Log — app.js
   FULL REWRITE (stable build)
   - FAB guaranteed via coordinate hitbox + correct pointer-events
   - Keeps: logo upload, filters toggle, entries grouped, add/edit/delete,
           bammer quick add, deposit quick add, appointments modal, studio modal shell
   ========================================================= */

const APP_VERSION = "stable-fab-1";

const LS = {
  ENTRIES: "entries",
  FILTERS: "filters",
  FILTERS_UI: "filtersUI",
  LOGO: "logoDataUrl",
  PAYDAY: "payday",
  SPLIT: "splitSettings",
};

const DEFAULT_FILTERS = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
const DEFAULT_FILTERS_UI = { open: false };
const DEFAULT_SPLIT = { defaultPct: 100, monthOverrides: {} };

let entries = safeJsonParse(localStorage.getItem(LS.ENTRIES), []) || [];
let filters = safeJsonParse(localStorage.getItem(LS.FILTERS), DEFAULT_FILTERS) || DEFAULT_FILTERS;
let filtersUI = safeJsonParse(localStorage.getItem(LS.FILTERS_UI), DEFAULT_FILTERS_UI) || DEFAULT_FILTERS_UI;
let payday = Number(localStorage.getItem(LS.PAYDAY) || 0);
let splitSettings = safeJsonParse(localStorage.getItem(LS.SPLIT), DEFAULT_SPLIT) || DEFAULT_SPLIT;

let editingId = null;
let viewingId = null;

const $ = (id) => document.getElementById(id);
const normalize = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");

function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function parseLocalDate(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function formatYYYYMM(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function monthName(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
}
function money(n) {
  const num = Number(n || 0);
  const v = Number.isFinite(num) ? num : 0;
  return "$" + v.toFixed(2).replace(/\.00$/, "");
}
function clampPct(p) {
  p = Number(p);
  if (!Number.isFinite(p)) return 100;
  return Math.max(0, Math.min(100, p));
}

/* ===================== payments helpers ===================== */
function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/* totals rule (internal):
   PAID => total price
   PARTIAL => paid so far
   else => 0
*/
function totalForTotalsGross(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  return 0;
}
function getSplitPctForDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return clampPct(splitSettings.defaultPct || 100);
  const key = formatYYYYMM(d);
  const override = splitSettings.monthOverrides && splitSettings.monthOverrides[key];
  const pct = (override !== undefined && override !== null) ? Number(override) : Number(splitSettings.defaultPct || 100);
  return clampPct(pct);
}
function totalForTotalsNet(entry) {
  const gross = totalForTotalsGross(entry);
  const pct = getSplitPctForDate(entry.date);
  return Number(gross || 0) * (pct / 100);
}

/* preview Paid line:
   PAID => total price
   PARTIAL => paid so far
   BOOKED => deposit
   else => 0
*/
function paidForPreview(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

/* ===================== toasts ===================== */
const TOAST_MS = 7000;
function toastCard({ title="Notification", sub="", icon="✨" } = {}) {
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
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector("[data-close]")?.addEventListener("click", (e) => { e.stopPropagation(); remove(); });
  setTimeout(remove, TOAST_MS);
}

/* ===================== modals ===================== */
const MODAL_IDS = [
  "formModal","viewModal","exportModal","bammerModal","depositModal",
  "appointmentsModal","studioModal"
];

function closeAllModals() {
  MODAL_IDS.forEach(id => { const m = $(id); if (m) m.style.display = "none"; });
  editingId = null;
  viewingId = null;
}
function showModal(id) { closeAllModals(); const m = $(id); if (m) m.style.display = "flex"; }
function hideModal(id) { const m = $(id); if (m) m.style.display = "none"; }

function wireModalClickOff(modalId, boxId, onClose) {
  const modal = $(modalId);
  const box = $(boxId);
  if (!modal || !box) return;
  modal.addEventListener("click", (e) => { if (e.target === modal) onClose(); });
  box.addEventListener("click", (e) => e.stopPropagation());
}

/* ===================== logo ===================== */
function initLogo() {
  const img = $("logoImg");
  const input = $("logoInput");
  if (!img || !input) return;

  const saved = localStorage.getItem(LS.LOGO);
  if (saved) img.src = saved;

  img.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      localStorage.setItem(LS.LOGO, e.target.result);
      img.src = e.target.result;
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
}

/* ===================== filters ===================== */
function applyFiltersUIState() {
  const content = $("filtersContent");
  const chev = $("filtersChev");
  if (content) content.style.display = filtersUI.open ? "block" : "none";
  if (chev) chev.textContent = filtersUI.open ? "▴" : "▾";
}
function updateFiltersSummary() {
  const parts = [];
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (filters.status !== "all") parts.push(`Status: ${filters.status.toUpperCase()}`);
  if (filters.location !== "all") parts.push(`Loc: ${filters.location}`);
  if (filters.from) parts.push(`From: ${filters.from}`);
  if (filters.to) parts.push(`To: ${filters.to}`);
  if (filters.sort !== "newest") parts.push(`Sort: ${filters.sort}`);
  const s = $("filtersSummary");
  if (s) s.textContent = parts.length ? `• ${parts.join(" • ")}` : "• none";
}
function hydrateFilterUI() {
  if ($("q")) $("q").value = filters.q || "";
  if ($("statusFilter")) $("statusFilter").value = filters.status || "all";
  if ($("locationFilter")) $("locationFilter").value = filters.location || "all";
  if ($("fromDate")) $("fromDate").value = filters.from || "";
  if ($("toDate")) $("toDate").value = filters.to || "";
  if ($("sortFilter")) $("sortFilter").value = filters.sort || "newest";
  updateFiltersSummary();
  applyFiltersUIState();
}
function toggleFilters() {
  filtersUI.open = !filtersUI.open;
  localStorage.setItem(LS.FILTERS_UI, JSON.stringify(filtersUI));
  applyFiltersUIState();
}
function applyFilters() {
  filters.q = String($("q")?.value || "").trim();
  filters.status = $("statusFilter")?.value || "all";
  filters.location = $("locationFilter")?.value || "all";
  filters.from = $("fromDate")?.value || "";
  filters.to = $("toDate")?.value || "";
  filters.sort = $("sortFilter")?.value || "newest";
  localStorage.setItem(LS.FILTERS, JSON.stringify(filters));
  updateFiltersSummary();
  render();
}
function clearFilters() {
  filters = { ...DEFAULT_FILTERS };
  localStorage.setItem(LS.FILTERS, JSON.stringify(filters));
  hydrateFilterUI();
  render();
}
function passesFilters(entry) {
  if (filters.status !== "all" && (entry.status || "unpaid") !== filters.status) return false;
  if (filters.location !== "all" && (entry.location || "") !== filters.location) return false;

  const d = parseLocalDate(entry.date);
  if (!d) return false;

  if (filters.from) {
    const from = parseLocalDate(filters.from);
    if (from && d < from) return false;
  }
  if (filters.to) {
    const to = parseLocalDate(filters.to);
    if (to && d > to) return false;
  }

  const q = normalize(filters.q).trim();
  if (q) {
    const hay = [entry.client, entry.description, entry.location].map(normalize).join(" | ");
    if (!hay.includes(q)) return false;
  }
  return true;
}
function getFilteredEntries() {
  const list = entries.filter(passesFilters);
  list.sort((a, b) => (filters.sort === "oldest" ? (a.id - b.id) : (b.id - a.id)));
  return list;
}

/* ===================== accordion ===================== */
function createAccordion(title, badgeText) {
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

  if (badgeText !== undefined && badgeText !== null) {
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

  header.addEventListener("click", () => {
    const isOpen = content.style.display === "block";
    content.style.display = isOpen ? "none" : "block";
    chev.textContent = isOpen ? "▾" : "▴";
  });

  wrap.appendChild(header);
  wrap.appendChild(content);
  return { wrap, content };
}

/* ===================== stats ===================== */
function currentQuarterIndex(dateObj) { return Math.floor(dateObj.getMonth() / 3); }
function getWeekWindowFromDate(anchorDate) {
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
function updateStats(list) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindowFromDate(now);
  const qNow = currentQuarterIndex(now);

  let today = 0, week = 0, month = 0, quarter = 0, year = 0;

  (list || entries).forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;

    const amt = totalForTotalsNet(e);

    if (e.date === todayStr) today += amt;

    if (d.getFullYear() === now.getFullYear()) {
      year += amt;
      if (currentQuarterIndex(d) === qNow) quarter += amt;
    }
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += amt;
    if (d >= weekWin.start && d <= weekWin.end) week += amt;
  });

  $("todayTotal").textContent = money(today);
  $("weekTotal").textContent = money(week);
  $("monthTotal").textContent = money(month);
  $("quarterTotal").textContent = money(quarter);
  $("yearTotal").textContent = money(year);
}

/* ===================== render ===================== */
function render() {
  hydrateFilterUI();

  const locationSelect = $("locationFilter");
  if (locationSelect) {
    const current = filters.location || "all";
    const locs = Array.from(new Set(entries.map(e => e.location).filter(Boolean))).sort();
    locationSelect.innerHTML =
      `<option value="all">All Locations</option>` +
      locs.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
    locationSelect.value = current;
  }

  const container = $("entries");
  container.innerHTML = "";

  const list = getFilteredEntries();
  if (!list.length) {
    container.innerHTML = "<p style='opacity:.65; padding: 10px 2px;'>No entries match your filters.</p>";
    updateStats(list);
    return;
  }

  const grouped = {};
  list.forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    grouped[y] ??= {};
    grouped[y][m] ??= {};
    grouped[y][m][day] ??= [];
    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a,b)=>Number(b)-Number(a)).forEach(year => {
    const yearAmt = Object.values(grouped[year]).flatMap(mo => Object.values(mo).flat())
      .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

    const yearAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx => {
      const monthAmt = Object.values(grouped[year][monthIdx]).flat()
        .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmt));
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum => {
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmt = dayEntries.reduce((sum, e) => sum + totalForTotalsNet(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx)+1)}-${pad2(dayNum)}`;
        const dayAcc = createAccordion(dateLabel, money(dayAmt));
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries.forEach(entry => {
          const paidLine = money(paidForPreview(entry));
          const row2 = [entry.location, entry.description].filter(Boolean).join(" • ");

          const row = document.createElement("div");
          row.className = "entry";
          row.innerHTML = `
            <div class="entry-left">
              <div class="entry-name">${escapeHtml(entry.client || "")}</div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${escapeHtml(row2 || "")}</div>
              </div>
            </div>
            <div class="status ${escapeHtml(entry.status || "unpaid")}">${escapeHtml(entry.status || "unpaid")}</div>
          `;
          row.addEventListener("click", () => viewEntry(entry.id));
          dayAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);
}

function saveEntries() {
  localStorage.setItem(LS.ENTRIES, JSON.stringify(entries));
}

/* ===================== forms ===================== */
function opt(val, label, current) {
  const sel = String(current || "").toLowerCase() === val ? "selected" : "";
  return `<option value="${val}" ${sel}>${label}</option>`;
}

function openForm(existingEntry = null) {
  const box = $("formBox");
  const today = new Date().toISOString().split("T")[0];

  editingId = existingEntry ? existingEntry.id : null;

  const entry = existingEntry || {
    date: today,
    status: "unpaid",
    client: "",
    location: "",
    total: 0,
    description: "",
    notes: "",
    payments: [],
  };

  const dep = depositAmount(entry);
  const sessions = paymentsArray(entry).filter(p => p.kind === "session");

  box.innerHTML = `
    <div class="modal-title">${existingEntry ? "Edit Entry" : "Add Entry"}</div>

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
      <input id="client" placeholder="Client name" value="${escapeHtml(entry.client || "")}">
      <input id="location" placeholder="Location" value="${escapeHtml(entry.location || "")}">
    </div>

    <div class="row">
      <input id="total" type="number" placeholder="Total price" value="${Number(entry.total || 0)}">
      <input id="deposit" type="number" placeholder="Deposit" value="${Number(dep || 0)}">
    </div>

    <div class="row">
      <textarea id="description" placeholder="Description">${escapeHtml(entry.description || "")}</textarea>
    </div>

    <div class="row">
      <textarea id="notes" placeholder="Notes">${escapeHtml(entry.notes || "")}</textarea>
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

  $("btnAddSession").addEventListener("click", () => addSessionRow("", "", $("sessions")));
  $("btnSaveEntry").addEventListener("click", saveEntry);
  $("btnCloseForm").addEventListener("click", closeForm);

  showModal("formModal");
}
function closeForm(){ hideModal("formModal"); editingId = null; }

function addSessionRow(amount = "", note = "", container) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount" value="${escapeHtml(amount)}">
    <input type="text" class="session-note" placeholder="Session Note (optional)" value="${escapeHtml(note)}">
  `;
  container.appendChild(row);
}

function saveEntry() {
  const dateVal = $("date").value || "";
  const clientVal = String($("client").value || "").trim();
  if (!dateVal || !clientVal) return alert("Date and Client Name are required.");

  const depositVal = Number($("deposit").value || 0);
  const payments = [];
  if (depositVal > 0) payments.push({ amount: depositVal, kind: "deposit", note: "" });

  const amounts = Array.from(document.querySelectorAll(".session-amount"));
  const notes = Array.from(document.querySelectorAll(".session-note"));
  amounts.forEach((el, i) => {
    const val = Number(el.value || 0);
    if (val > 0) payments.push({ amount: val, kind: "session", note: String(notes[i]?.value || "") });
  });

  const newData = {
    date: dateVal,
    client: clientVal,
    status: $("status").value || "unpaid",
    total: Number($("total").value || 0),
    location: $("location").value || "",
    description: $("description").value || "",
    notes: $("notes").value || "",
    payments,
  };

  const nowIso = new Date().toISOString();

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx < 0) return;
    entries[idx] = { ...entries[idx], ...newData, updatedAt: nowIso };
  } else {
    entries.push({ id: Date.now(), ...newData, createdAt: nowIso, updatedAt: null });
  }

  saveEntries();
  closeForm();
  render();
}

/* ===================== view / delete ===================== */
function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const box = $("viewBox");
  viewingId = id;

  const dep = depositAmount(entry);

  box.innerHTML = `
    <div class="modal-title">${escapeHtml(entry.client)} — ${escapeHtml(entry.date)}</div>

    <div class="row">
      <div style="width:100%;">
        <p><strong>Status:</strong> <span class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${dep > 0 ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
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

  $("btnEditEntry").addEventListener("click", () => { closeView(); openForm(entry); });
  $("btnDeleteEntry").addEventListener("click", () => deleteEntry(id));
  $("btnCloseView").addEventListener("click", closeView);

  showModal("viewModal");
}
function closeView(){ hideModal("viewModal"); viewingId = null; }

function deleteEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Delete entry for ${entry.client} on ${entry.date}?`)) return;

  entries = entries.filter(e => e.id !== id);
  saveEntries();
  closeView();
  render();
}

/* ===================== quick adds ===================== */
function openBammerQuick() {
  const box = $("bammerBox");
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

  $("btnSaveBammer").addEventListener("click", () => {
    const date = $("bDate").value || "";
    const client = String($("bClient").value || "").trim();
    if (!date || !client) return alert("Date + Client required.");

    entries.push({
      id: Date.now(),
      date,
      client,
      status: $("bStatus").value || "paid",
      total: Number($("bTotal").value || 0),
      location: $("bLocation").value || "",
      description: $("bDesc").value || "",
      notes: "",
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    saveEntries();
    closeBammerQuick();
    render();
  });

  $("btnCloseBammer").addEventListener("click", closeBammerQuick);
  showModal("bammerModal");
}
function closeBammerQuick(){ hideModal("bammerModal"); }

function openDepositQuick() {
  const box = $("depositBox");
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

  $("btnSaveDeposit").addEventListener("click", () => {
    const date = $("dDate").value || "";
    const client = String($("dClient").value || "").trim();
    const dep = Number($("dDeposit").value || 0);

    if (!date || !client) return alert("Date + Client required.");
    if (!(dep > 0)) return alert("Deposit must be > 0.");

    entries.push({
      id: Date.now(),
      date,
      client,
      status: "booked",
      total: Number($("dTotal").value || 0),
      location: $("dLocation").value || "",
      description: $("dDesc").value || "",
      notes: "",
      payments: [{ amount: dep, kind: "deposit", note: "" }],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });

    saveEntries();
    closeDepositQuick();
    render();
  });

  $("btnCloseDeposit").addEventListener("click", closeDepositQuick);
  showModal("depositModal");
}
function closeDepositQuick(){ hideModal("depositModal"); }

/* ===================== top buttons ===================== */
function openAppointments() {
  const box = $("appointmentsBox");
  const today = new Date(); today.setHours(0,0,0,0);

  const booked = entries
    .filter(e => (e.status || "").toLowerCase() === "booked")
    .filter(e => { const d = parseLocalDate(e.date); return d && d >= today; })
    .sort((a,b) => parseLocalDate(a.date) - parseLocalDate(b.date));

  box.innerHTML = `
    <div class="modal-title">Appointments</div>
    ${booked.length ? booked.map(e => {
      const dep = depositAmount(e);
      const row2 = [e.location, e.description].filter(Boolean).join(" • ");
      return `
        <div class="entry" style="cursor:pointer;" data-id="${e.id}">
          <div>
            <div class="entry-name">${escapeHtml(e.client)} <span class="status booked" style="margin-left:8px;">BOOKED</span></div>
            <div class="entry-sub">
              ${dep > 0 ? `<div class="sub-row"><strong>Deposit:</strong> ${money(dep)}</div>` : ``}
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

  box.querySelectorAll("[data-id]").forEach(card => {
    card.addEventListener("click", () => {
      const id = Number(card.getAttribute("data-id"));
      closeAppointments();
      viewEntry(id);
    });
  });

  $("btnCloseAppts").addEventListener("click", closeAppointments);
  showModal("appointmentsModal");
}
function closeAppointments(){ hideModal("appointmentsModal"); }

function openStudio() {
  const box = $("studioBox");
  box.innerHTML = `
    <div class="modal-title">Studio</div>

    <div style="opacity:.85; margin-bottom:10px;">
      (We’ll expand this screen for split/rewards/discount rules — UI is stable here.)
    </div>

    <div class="row">
      <input id="defaultSplitPct" type="number" value="${clampPct(splitSettings.defaultPct)}" placeholder="Default split %">
      <button type="button" id="btnSaveSplit">Save</button>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseStudio">Close</button>
    </div>
  `;

  $("btnSaveSplit").addEventListener("click", () => {
    splitSettings.defaultPct = clampPct($("defaultSplitPct").value || 100);
    localStorage.setItem(LS.SPLIT, JSON.stringify(splitSettings));
    toastCard({ title: "Studio saved", sub: `Split set to ${splitSettings.defaultPct}%`, icon: "🏦" });
    render();
  });

  $("btnCloseStudio").addEventListener("click", closeStudio);
  showModal("studioModal");
}
function closeStudio(){ hideModal("studioModal"); }

function openExport() {
  const box = $("exportBox");
  box.innerHTML = `
    <div class="modal-title">Export</div>
    <div style="opacity:.85;">Export UI stays stable here — we’ll finish CSV/summary once your core flow is locked.</div>
    <div class="actionsRow" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseExport">Close</button>
    </div>
  `;
  $("btnCloseExport").addEventListener("click", closeExport);
  showModal("exportModal");
}
function closeExport(){ hideModal("exportModal"); }

/* ===================== FAB GUARANTEE (hitbox) ===================== */
let lastFabAt = 0;
function canFireFab() {
  const now = Date.now();
  if (now - lastFabAt < 280) return false;
  lastFabAt = now;
  return true;
}
function rectOf(el){
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // expand a little so it’s forgiving
  const pad = 8;
  return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
}
function pointInRect(x,y,r){
  return r && x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
}
function runFabAction(action){
  if (action === "add") openForm(null);
  if (action === "deposit") openDepositQuick();
  if (action === "bammer") openBammerQuick();
}
function installFabHitbox(){
  const handler = (x,y,rawEvent) => {
    const add = $("fabAdd");
    const dep = $("fabDeposit");
    const bam = $("fabBammer");

    const addR = rectOf(add);
    const depR = rectOf(dep);
    const bamR = rectOf(bam);

    let action = null;
    // order: smalls first so they don’t get “stolen” by the big button area
    if (pointInRect(x,y,depR)) action = "deposit";
    else if (pointInRect(x,y,bamR)) action = "bammer";
    else if (pointInRect(x,y,addR)) action = "add";

    if (!action) return;
    if (!canFireFab()) return;

    rawEvent?.preventDefault?.();
    rawEvent?.stopPropagation?.();
    rawEvent?.stopImmediatePropagation?.?.();

    runFabAction(action);
  };

  document.addEventListener("pointerdown", (e) => {
    handler(e.clientX, e.clientY, e);
  }, true);

  document.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    handler(t.clientX, t.clientY, e);
  }, { capture:true, passive:false });

  // Also bind direct clicks (desktop)
  $("fabAdd")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); runFabAction("add"); });
  $("fabDeposit")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); runFabAction("deposit"); });
  $("fabBammer")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); runFabAction("bammer"); });
}

/* ===================== init ===================== */
function init() {
  // modal click-off
  wireModalClickOff("formModal","formBox",closeForm);
  wireModalClickOff("viewModal","viewBox",closeView);
  wireModalClickOff("exportModal","exportBox",closeExport);
  wireModalClickOff("bammerModal","bammerBox",closeBammerQuick);
  wireModalClickOff("depositModal","depositBox",closeDepositQuick);
  wireModalClickOff("appointmentsModal","appointmentsBox",closeAppointments);
  wireModalClickOff("studioModal","studioBox",closeStudio);

  // top buttons
  $("btnAppointments").addEventListener("click", openAppointments);
  $("btnStudio").addEventListener("click", openStudio);
  $("btnExport").addEventListener("click", openExport);

  // filters
  $("filtersHeader").addEventListener("click", toggleFilters);
  $("btnApplyFilters").addEventListener("click", applyFilters);
  $("btnClearFilters").addEventListener("click", clearFilters);
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });

  initLogo();
  installFabHitbox();

  render();
  toastCard({ title: "Loaded", sub: `All systems stable. (${APP_VERSION})`, icon: "✅" });
}

document.addEventListener("DOMContentLoaded", init);