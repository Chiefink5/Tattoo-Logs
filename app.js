/* =========================================================
   Globber’s Ink Log — app.js (FULL REWRITE)
   Fixes: FAB buttons not responding (scope + wiring issues)
   Notes:
   - Works with BOTH setups:
     A) FAB buttons outside .page with ids: fabAdd/fabDeposit/fabBammer
     B) Older inline onclick buttons
   ========================================================= */

/* ===================== STATE ===================== */
let entries = JSON.parse(localStorage.getItem("entries") || "[]");
let editingId = null;
let viewingId = null;

let payday = Number(localStorage.getItem("payday") || 0);
let payPeriodAnchor = null;

let splitSettings = JSON.parse(localStorage.getItem("splitSettings") || "null") || {
  defaultPct: 100,
  monthOverrides: {}
};

let filters = JSON.parse(localStorage.getItem("filters") || "null") || {
  q: "",
  status: "all",
  location: "all",
  from: "",
  to: "",
  sort: "newest"
};

let filtersUI = JSON.parse(localStorage.getItem("filtersUI") || "null") || { open: false };

let rewardsSettings = JSON.parse(localStorage.getItem("rewardsSettings") || "null") || {
  levels: [
    { id: "lvl1", name: "Rookie", minCount: 1, pngDataUrl: "" },
    { id: "lvl2", name: "Regular", minCount: 5, pngDataUrl: "" },
    { id: "lvl3", name: "VIP", minCount: 10, pngDataUrl: "" }
  ],
  discounts: [
    { id: "d1", label: "5% off", minCount: 5, type: "percent", value: 5 },
    { id: "d2", label: "$20 off", minCount: 10, type: "static", value: 20 }
  ]
};

let clientDiscountOverrides =
  JSON.parse(localStorage.getItem("clientDiscountOverrides") || "null") || {};

let prefillClient = null;

/* ===================== HELPERS ===================== */
const $ = (id) => document.getElementById(id);
const normalize = (s) => String(s || "").toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");
const uid = (p = "id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function parseLocalDate(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function formatYYYYMMDD(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function formatYYYYMM(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

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

function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
function hasAnyPayments(entry) { return paymentsArray(entry).some(p => Number(p.amount || 0) > 0); }
function hasSessions(entry) { return paymentsArray(entry).some(p => p.kind === "session" && Number(p.amount || 0) > 0); }
function isDepositOnlyEntry(entry) { return depositAmount(entry) > 0 && !hasSessions(entry); }
function isTattooEntry(entry) { return !isDepositOnlyEntry(entry); }

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
  const pct = (override !== undefined && override !== null)
    ? Number(override)
    : Number(splitSettings.defaultPct || 100);
  return clampPct(pct);
}
function netFromGross(gross, pct) { return Number(gross || 0) * (clampPct(pct) / 100); }
function totalForTotalsNet(entry) {
  const gross = totalForTotalsGross(entry);
  const pct = getSplitPctForDate(entry.date);
  return netFromGross(gross, pct);
}
function paidForPreview(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

/* ===================== MODALS (SAFE) ===================== */
const MODAL_IDS = [
  "formModal","viewModal","exportModal","bammerModal","depositModal",
  "clientModal","rewardsModal","appointmentsModal","studioModal"
];

function forceCloseAllModals() {
  MODAL_IDS.forEach(id => {
    const m = $(id);
    if (m) m.style.display = "none";
  });
  editingId = null;
  viewingId = null;
}

function showModal(id) {
  forceCloseAllModals(); // prevents “invisible stuck overlay”
  const m = $(id);
  if (m) m.style.display = "flex";
}

function hideModal(id) {
  const m = $(id);
  if (m) m.style.display = "none";
}

/* Click-off-to-close (won’t break if boxes don’t exist yet) */
function wireModalClickOff(modalId, boxId, onClose) {
  const modal = $(modalId);
  const box = $(boxId);
  if (!modal || !box) return;

  modal.addEventListener("click", (e) => {
    if (e.target === modal) onClose();
  });
  box.addEventListener("click", (e) => e.stopPropagation());
}

/* ===================== LOGO ===================== */
function initLogo() {
  const img = $("logoImg");
  const input = $("logoInput");
  if (!img || !input) return;

  const saved = localStorage.getItem("logoDataUrl");
  if (saved) {
    img.src = saved;
  } else {
    img.src = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#16201b"/>
        <text x="50%" y="58%" text-anchor="middle" font-family="Inter" font-size="28" font-weight="800" fill="#d4af37">G</text>
      </svg>
    `);
  }

  img.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      localStorage.setItem("logoDataUrl", e.target.result);
      img.src = e.target.result;
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
}

/* ===================== FILTERS UI ===================== */
function toggleFilters() {
  filtersUI.open = !filtersUI.open;
  localStorage.setItem("filtersUI", JSON.stringify(filtersUI));
  applyFiltersUIState();
}
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

function applyFilters() {
  filters.q = String($("q")?.value || "").trim();
  filters.status = $("statusFilter")?.value || "all";
  filters.location = $("locationFilter")?.value || "all";
  filters.from = $("fromDate")?.value || "";
  filters.to = $("toDate")?.value || "";
  filters.sort = $("sortFilter")?.value || "newest";
  localStorage.setItem("filters", JSON.stringify(filters));
  updateFiltersSummary();
  render();
}

function clearFilters() {
  filters = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
  localStorage.setItem("filters", JSON.stringify(filters));
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

/* ===================== ACCORDION BUILDER ===================== */
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

function monthName(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
}

/* ===================== STATS ===================== */
function currentQuarterIndex(dateObj) { return Math.floor(dateObj.getMonth() / 3); }

function getWeekWindowFromDate(anchorDate) {
  const now = new Date(anchorDate);
  const currentDay = now.getDay();
  const diffToPayday = (currentDay - payday + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - diffToPayday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function updateStats(list) {
  const todayEl = $("todayTotal");
  if (!todayEl) return;

  const weekEl = $("weekTotal");
  const monthEl = $("monthTotal");
  const quarterEl = $("quarterTotal");
  const yearEl = $("yearTotal");

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindowFromDate(now);
  const qNow = currentQuarterIndex(now);

  let today = 0, week = 0, month = 0, quarter = 0, year = 0;

  (list || entries).forEach(entry => {
    const d = parseLocalDate(entry.date);
    if (!d) return;

    const amt = totalForTotalsNet(entry);

    if (entry.date === todayStr) today += amt;

    if (d.getFullYear() === now.getFullYear()) {
      year += amt;
      if (currentQuarterIndex(d) === qNow) quarter += amt;
    }

    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      month += amt;
    }

    if (d >= weekWin.start && d <= weekWin.end) {
      week += amt;
    }
  });

  todayEl.textContent = money(today);
  if (weekEl) weekEl.textContent = money(week);
  if (monthEl) monthEl.textContent = money(month);
  if (quarterEl) quarterEl.textContent = money(quarter);
  if (yearEl) yearEl.textContent = money(year);
}

/* ===================== CORE RENDER ===================== */
function render() {
  hydrateFilterUI();

  // location dropdown options
  const locationSelect = $("locationFilter");
  if (locationSelect) {
    const current = filters.location || "all";
    const locs = Array.from(new Set(entries.map(e => e.location).filter(Boolean))).sort();
    locationSelect.innerHTML =
      `<option value="all">All Locations</option>` +
      locs.map(l => `<option value="${l}">${l}</option>`).join("");
    locationSelect.value = current;
  }

  const container = $("entries");
  if (!container) return;
  container.innerHTML = "";

  const list = getFilteredEntries();

  if (list.length === 0) {
    container.innerHTML = "<p style='opacity:.65;'>No entries match your filters.</p>";
    updateStats(list);
    return;
  }

  // group by y/m/d
  const grouped = {};
  list.forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    grouped[y] ??= {};
    grouped[y][m] ??= {};
    grouped[y][m][day] ??= [];
    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a, b) => Number(b) - Number(a)).forEach(year => {
    const yearAmt = Object.values(grouped[year])
      .flatMap(mo => Object.values(mo).flat())
      .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

    const yearAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a, b) => Number(b) - Number(a)).forEach(monthIdx => {
      const monthAmt = Object.values(grouped[year][monthIdx]).flat()
        .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

      const monthAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmt));
      yearAcc.content.appendChild(monthAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a, b) => Number(b) - Number(a)).forEach(dayNum => {
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmt = dayEntries.reduce((sum, e) => sum + totalForTotalsNet(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx) + 1)}-${pad2(dayNum)}`;
        const dayAcc = createAccordion(dateLabel, money(dayAmt));
        monthAcc.content.appendChild(dayAcc.wrap);

        dayEntries.forEach(entry => {
          const paidLine = money(paidForPreview(entry));
          const row2 = [entry.location, entry.description].filter(Boolean).join(" • ");

          const row = document.createElement("div");
          row.className = "entry";
          row.innerHTML = `
            <div class="entry-left">
              <div class="entry-name">
                <span class="client-link">${entry.client}</span>
              </div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${row2 || ""}</div>
              </div>
            </div>
            <div class="status ${entry.status || "unpaid"}">${entry.status || "unpaid"}</div>
          `;

          row.querySelector(".client-link").addEventListener("click", (ev) => {
            ev.stopPropagation();
            // keep simple: clicking name just opens the view too (you can re-add client profiles later)
            viewEntry(entry.id);
          });

          row.addEventListener("click", () => viewEntry(entry.id));
          dayAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);
}

/* ===================== VIEW / FORM ===================== */
function openForm() {
  editingId = null;
  const box = $("formBox");
  if (!box) return;

  const today = new Date().toISOString().split("T")[0];

  box.innerHTML = `
    <div class="modal-title">Add Entry</div>

    <div class="row">
      <input id="date" type="date" value="${today}">
      <select id="status">
        <option value="unpaid">UNPAID</option>
        <option value="partial">PARTIAL</option>
        <option value="paid">PAID</option>
        <option value="booked">BOOKED</option>
        <option value="no_show">NO SHOW</option>
      </select>
    </div>

    <div class="row">
      <input id="client" placeholder="Client name">
      <input id="location" placeholder="Location">
    </div>

    <div class="row">
      <input id="total" type="number" placeholder="Total price">
      <input id="deposit" type="number" placeholder="Deposit">
    </div>

    <div class="row">
      <input id="contact" placeholder="Contact (optional)">
      <input id="social" placeholder="Social (optional)">
    </div>

    <div class="row">
      <textarea id="description" placeholder="Description"></textarea>
    </div>

    <div class="row">
      <textarea id="notes" placeholder="Notes"></textarea>
    </div>

    <div style="margin-top:10px; font-weight:900; color: var(--gold, #d4af37);">Additional Sessions</div>
    <div id="sessions"></div>

    <div class="actions-row">
      <button type="button" id="btnAddSession">+ Additional session</button>
    </div>

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" id="btnSaveEntry">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseForm">Close</button>
    </div>
  `;

  // prefill if requested
  if (prefillClient) {
    if ($("client")) $("client").value = prefillClient.client || "";
    if ($("contact")) $("contact").value = prefillClient.contact || "";
    if ($("social")) $("social").value = prefillClient.social || "";
    prefillClient = null;
  }

  $("btnAddSession").addEventListener("click", addSession);
  $("btnSaveEntry").addEventListener("click", saveEntry);
  $("btnCloseForm").addEventListener("click", closeForm);

  showModal("formModal");
}

function closeForm() {
  hideModal("formModal");
  editingId = null;
}

function addSession(amount = "", note = "") {
  const container = $("sessions");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount" value="${amount}">
    <input type="text" class="session-note" placeholder="Session Note (optional)" value="${note}">
  `;
  container.appendChild(row);
}

function saveEntry() {
  const dateVal = $("date")?.value || "";
  const clientVal = String($("client")?.value || "").trim();
  if (!dateVal || !clientVal) {
    alert("Date and Client Name are required.");
    return;
  }

  const depositVal = Number($("deposit")?.value || 0);
  const payments = [];
  if (depositVal > 0) payments.push({ amount: depositVal, kind: "deposit" });

  document.querySelectorAll(".session-amount").forEach((el, i) => {
    const val = Number(el.value || 0);
    if (val > 0) {
      const noteEl = document.querySelectorAll(".session-note")[i];
      payments.push({ amount: val, kind: "session", note: noteEl ? (noteEl.value || "") : "" });
    }
  });

  const entry = {
    id: Date.now(),
    date: dateVal,
    client: clientVal,
    status: $("status")?.value || "unpaid",
    total: Number($("total")?.value || 0),
    location: $("location")?.value || "",
    contact: $("contact")?.value || "",
    social: $("social")?.value || "",
    description: $("description")?.value || "",
    notes: $("notes")?.value || "",
    payments,
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  };

  entries.push(entry);
  localStorage.setItem("entries", JSON.stringify(entries));
  closeForm();
  render();
}

function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  const box = $("viewBox");
  if (!entry || !box) return;

  viewingId = id;

  const dep = depositAmount(entry);
  const paidSoFar = paidAmount(entry);

  box.innerHTML = `
    <div class="modal-title">${entry.client} — ${entry.date}</div>

    <div class="row">
      <div style="width:100%;">
        <p><strong>Status:</strong> <span class="status ${entry.status}">${entry.status}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${dep > 0 ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
      </div>
      <div style="width:100%;">
        <p><strong>Location:</strong> ${entry.location || ""}</p>
      </div>
    </div>

    ${entry.description ? `<p><strong>Description:</strong> ${entry.description}</p>` : ``}
    ${entry.contact ? `<p><strong>Contact:</strong> ${entry.contact}</p>` : ``}
    ${entry.social ? `<p><strong>Social:</strong> ${entry.social}</p>` : ``}
    ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ``}

    ${hasAnyPayments(entry) ? `
      <h4 style="margin-top:14px;">Payments</h4>
      <ul>
        ${paymentsArray(entry).map(p => `<li>${money(p.amount)} ${p.kind ? `(${p.kind})` : ""}${p.note ? ` — ${p.note}` : ""}</li>`).join("")}
      </ul>
    ` : ``}

    <details style="margin-top:12px;">
      <summary>More details</summary>
      <div style="margin-top:10px;">
        <p><strong>Paid So Far:</strong> ${money(paidSoFar)}</p>
        ${Number(entry.total || 0) > 0 ? `<p><strong>Remaining:</strong> ${money(Number(entry.total || 0) - paidSoFar)}</p>` : ``}
      </div>
    </details>

    <div class="actions-row" style="margin-top:16px;">
      <button type="button" class="dangerbtn" id="btnDeleteEntry">Delete</button>
      <button type="button" class="secondarybtn" id="btnCloseView">Close</button>
    </div>
  `;

  $("btnDeleteEntry").addEventListener("click", () => deleteEntry(id));
  $("btnCloseView").addEventListener("click", closeView);

  showModal("viewModal");
}

function closeView() {
  hideModal("viewModal");
  viewingId = null;
}

function deleteEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Delete entry for ${entry.client} on ${entry.date}?`)) return;

  entries = entries.filter(e => e.id !== id);
  localStorage.setItem("entries", JSON.stringify(entries));
  closeView();
  render();
}

/* ===================== QUICK ADD: BAMMER ===================== */
function openBammerQuick() {
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

    <div class="actions-row">
      <button type="button" id="btnSaveBammer">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseBammer">Close</button>
    </div>
  `;

  if (prefillClient) {
    $("bClient").value = prefillClient.client || "";
    prefillClient = null;
  }

  $("btnSaveBammer").addEventListener("click", saveBammer);
  $("btnCloseBammer").addEventListener("click", closeBammerQuick);

  showModal("bammerModal");
}

function closeBammerQuick() { hideModal("bammerModal"); }

function saveBammer() {
  const date = $("bDate")?.value || "";
  const client = String($("bClient")?.value || "").trim();
  if (!date || !client) return alert("Date + Client required.");

  entries.push({
    id: Date.now(),
    date,
    client,
    status: $("bStatus")?.value || "paid",
    total: Number($("bTotal")?.value || 0),
    location: $("bLocation")?.value || "",
    description: $("bDesc")?.value || "",
    contact: "",
    social: "",
    notes: "",
    payments: [],
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  });

  localStorage.setItem("entries", JSON.stringify(entries));
  closeBammerQuick();
  render();
}

/* ===================== QUICK ADD: DEPOSIT ONLY ===================== */
function openDepositQuick() {
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

    <div class="row">
      <input id="dContact" placeholder="Contact (optional)">
      <input id="dSocial" placeholder="Social (optional)">
    </div>

    <div class="actions-row">
      <button type="button" id="btnSaveDeposit">Save</button>
      <button type="button" class="secondarybtn" id="btnCloseDeposit">Close</button>
    </div>
  `;

  if (prefillClient) {
    $("dClient").value = prefillClient.client || "";
    $("dContact").value = prefillClient.contact || "";
    $("dSocial").value = prefillClient.social || "";
    prefillClient = null;
  }

  $("btnSaveDeposit").addEventListener("click", saveDepositOnly);
  $("btnCloseDeposit").addEventListener("click", closeDepositQuick);

  showModal("depositModal");
}

function closeDepositQuick() { hideModal("depositModal"); }

function saveDepositOnly() {
  const date = $("dDate")?.value || "";
  const client = String($("dClient")?.value || "").trim();
  const dep = Number($("dDeposit")?.value || 0);
  if (!date || !client) return alert("Date + Client required.");
  if (!(dep > 0)) return alert("Deposit must be > 0.");

  entries.push({
    id: Date.now(),
    date,
    client,
    status: "booked",
    total: Number($("dTotal")?.value || 0),
    location: $("dLocation")?.value || "",
    description: $("dDesc")?.value || "",
    contact: $("dContact")?.value || "",
    social: $("dSocial")?.value || "",
    notes: "",
    payments: [{ amount: dep, kind: "deposit", note: "" }],
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  });

  localStorage.setItem("entries", JSON.stringify(entries));
  closeDepositQuick();
  render();
}

/* ===================== STUB SCREENS (so header buttons never error) ===================== */
function openExport() {
  const box = $("exportBox");
  if (!box) return;
  box.innerHTML = `
    <div class="modal-title">Export</div>
    <div class="hint">Export UI can be re-added here (your previous version had it).</div>
    <div class="actions-row">
      <button type="button" class="secondarybtn" onclick="closeExport()">Close</button>
    </div>
  `;
  showModal("exportModal");
}
function closeExport(){ hideModal("exportModal"); }

function openStudio() {
  const box = $("studioBox");
  if (!box) return;
  box.innerHTML = `
    <div class="modal-title">Studio</div>
    <div class="summary-box">
      <div style="font-weight:900;color:var(--gold,#d4af37);">Split</div>
      <div class="row">
        <input id="defaultSplitPct" type="number" value="${clampPct(splitSettings.defaultPct)}" placeholder="Default %">
        <button type="button" id="btnSaveSplit">Save</button>
      </div>
      <div class="hint">This is just the minimum Studio shell so nothing breaks.</div>
    </div>
    <div class="actions-row">
      <button type="button" class="secondarybtn" onclick="closeStudio()">Close</button>
    </div>
  `;
  $("btnSaveSplit").addEventListener("click", () => {
    splitSettings.defaultPct = clampPct($("defaultSplitPct")?.value || 100);
    localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
    closeStudio();
    render();
  });
  showModal("studioModal");
}
function closeStudio(){ hideModal("studioModal"); }

function openAppointments() {
  const box = $("appointmentsBox");
  if (!box) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const booked = entries
    .filter(e => (e.status || "").toLowerCase() === "booked")
    .filter(e => {
      const d = parseLocalDate(e.date);
      return d && d >= today;
    })
    .sort((a,b) => (parseLocalDate(a.date) - parseLocalDate(b.date)));

  box.innerHTML = `
    <div class="modal-title">Appointments</div>
    ${booked.length ? booked.map(e => {
      const dep = depositAmount(e);
      const row2 = [e.location, e.description].filter(Boolean).join(" • ");
      return `
        <div class="appt-card" data-id="${e.id}">
          <div class="appt-top">
            <div class="appt-name">${e.client} <span class="pill blue">BOOKED</span></div>
            <div class="appt-date">${e.date}</div>
          </div>
          <div class="appt-sub">
            ${dep > 0 ? `<div class="pill gold">Deposit: <b style="color:var(--gold,#d4af37)">${money(dep)}</b></div>` : ``}
            ${row2 ? `<div style="opacity:.9;">${row2}</div>` : ``}
          </div>
        </div>
      `;
    }).join("") : `<div class="summary-box"><div style="opacity:.75;">No upcoming booked appointments.</div></div>`}

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" onclick="closeAppointments()">Close</button>
    </div>
  `;

  box.querySelectorAll(".appt-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = Number(card.getAttribute("data-id"));
      closeAppointments();
      viewEntry(id);
    });
  });

  showModal("appointmentsModal");
}
function closeAppointments(){ hideModal("appointmentsModal"); }

/* ===================== FAB BUTTON WIRING (THE REAL FIX) ===================== */
function bindFABs() {
  // Preferred (new IDs)
  const addBtn = $("fabAdd");
  const depBtn = $("fabDeposit");
  const bamBtn = $("fabBammer");

  if (addBtn) addBtn.addEventListener("click", (e) => { e.preventDefault(); openForm(); });
  if (depBtn) depBtn.addEventListener("click", (e) => { e.preventDefault(); openDepositQuick(); });
  if (bamBtn) bamBtn.addEventListener("click", (e) => { e.preventDefault(); openBammerQuick(); });

  // Fallback: old structure: .fab.main and .fab.small (first small = deposit, second small = bammer)
  const main = document.querySelector(".fab.main");
  const smalls = Array.from(document.querySelectorAll(".fab.small"));

  if (!addBtn && main) main.addEventListener("click", (e) => { e.preventDefault(); openForm(); });

  if (!depBtn && smalls[0]) smalls[0].addEventListener("click", (e) => { e.preventDefault(); openDepositQuick(); });
  if (!bamBtn && smalls[1]) smalls[1].addEventListener("click", (e) => { e.preventDefault(); openBammerQuick(); });

  // Extra: on iOS sometimes click is weird; add touchend too (safe)
  const all = [addBtn, depBtn, bamBtn, main, smalls[0], smalls[1]].filter(Boolean);
  all.forEach(btn => {
    btn.addEventListener("touchend", (e) => {
      // don’t let browser treat it like scroll
      e.preventDefault();
      // trigger click logic
      btn.click();
    }, { passive: false });
  });
}

/* ===================== INIT ===================== */
function init() {
  // modal click-off wiring (safe)
  wireModalClickOff("formModal","formBox",closeForm);
  wireModalClickOff("viewModal","viewBox",closeView);
  wireModalClickOff("exportModal","exportBox",closeExport);
  wireModalClickOff("bammerModal","bammerBox",closeBammerQuick);
  wireModalClickOff("depositModal","depositBox",closeDepositQuick);
  wireModalClickOff("appointmentsModal","appointmentsBox",closeAppointments);
  wireModalClickOff("studioModal","studioBox",closeStudio);

  initLogo();

  // Enter key on search
  $("q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });

  // FABs (critical)
  bindFABs();

  render();
}

document.addEventListener("DOMContentLoaded", init);

/* ===================== EXPORT TO WINDOW (so nothing breaks) ===================== */
window.openForm = openForm;
window.closeForm = closeForm;
window.addSession = addSession;
window.saveEntry = saveEntry;

window.viewEntry = viewEntry;
window.closeView = closeView;

window.openBammerQuick = openBammerQuick;
window.closeBammerQuick = closeBammerQuick;
window.saveBammer = saveBammer;

window.openDepositQuick = openDepositQuick;
window.closeDepositQuick = closeDepositQuick;
window.saveDepositOnly = saveDepositOnly;

window.toggleFilters = toggleFilters;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

window.openExport = openExport;
window.closeExport = closeExport;

window.openStudio = openStudio;
window.closeStudio = closeStudio;

window.openAppointments = openAppointments;
window.closeAppointments = closeAppointments;