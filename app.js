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

// Filters UI state (open/closed)
let filtersUI = JSON.parse(localStorage.getItem("filtersUI") || "null") || {
  open: false
};

// Rewards
let rewardsSettings = JSON.parse(localStorage.getItem("rewardsSettings") || "null") || {
  levels: [
    { id: "lvl1", name: "Rookie", minCount: 1, pngDataUrl: "" },
    { id: "lvl2", name: "Regular", minCount: 5, pngDataUrl: "" },
    { id: "lvl3", name: "VIP", minCount: 10, pngDataUrl: "" }
  ],
  // discount tiers are now: { id, label, minCount, type: "percent"|"static"|"free", value }
  discounts: [
    { id: "d1", label: "5% off", minCount: 5, type: "percent", value: 5 },
    { id: "d2", label: "$20 off", minCount: 10, type: "static", value: 20 }
  ]
};

// Client-specific discount overrides (what YOU want to apply for them right now)
let clientDiscountOverrides =
  JSON.parse(localStorage.getItem("clientDiscountOverrides") || "null") || {
    // "clientkey": { tierId: "d2" }  // or tierId: "" for none
  };

let prefillClient = null;

// Toast queue
let toastQueue = [];
let toastTimer = null;

// ================= HELPERS =================
function safeEl(id) { return document.getElementById(id); }
function safeVal(id) { const el = safeEl(id); return el ? el.value : ""; }
function pad2(n) { return String(n).padStart(2, "0"); }
function money(n) {
  const num = Number(n || 0);
  const v = Number.isFinite(num) ? num : 0;
  return "$" + v.toFixed(2).replace(/\.00$/, "");
}
function monthName(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
}
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
function clampPct(p) {
  p = Number(p);
  if (!Number.isFinite(p)) return 100;
  return Math.max(0, Math.min(100, p));
}
function normalize(s) { return String(s || "").toLowerCase(); }
function uid(prefix = "id") { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
function hasAnyPayments(entry) { return paymentsArray(entry).some(p => Number(p.amount || 0) > 0); }
function hasSessions(entry) { return paymentsArray(entry).some(p => p.kind === "session" && Number(p.amount || 0) > 0); }
function isDepositOnlyEntry(entry) { return depositAmount(entry) > 0 && !hasSessions(entry); }
function isTattooEntry(entry) { return !isDepositOnlyEntry(entry); }

function currentQuarterIndex(dateObj) { return Math.floor(dateObj.getMonth() / 3); }

// ---- Totals (gross) ----
function totalForTotalsGross(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  return 0;
}

// Card preview “Paid:”
function paidForPreview(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

// ---- Split math (kept behind the scenes) ----
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

// ================= CLIENT REWARDS + DISCOUNTS =================
function clientKey(name) { return normalize(String(name || "")).trim(); }

function getClientEntries(name) {
  const key = clientKey(name);
  return entries
    .filter(e => clientKey(e.client) === key)
    .slice()
    .sort((a, b) => b.id - a.id);
}

function getClientTattooCount(name) {
  return getClientEntries(name).filter(isTattooEntry).length;
}

function getBestLevelForCount(count) {
  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  const sorted = levels
    .filter(l => Number(l.minCount || 0) > 0)
    .slice()
    .sort((a, b) => Number(a.minCount) - Number(b.minCount));
  let best = null;
  for (const l of sorted) if (count >= Number(l.minCount || 0)) best = l;
  return best;
}

function normalizeDiscountTier(t) {
  const type = (t.type || "percent").toLowerCase();
  const fixedType = (type === "percent" || type === "static" || type === "free") ? type : "percent";
  const value = Number(t.value || 0);
  return {
    id: t.id,
    label: String(t.label || "").trim() || (fixedType === "free" ? "FREE" : fixedType === "static" ? "$ off" : "% off"),
    minCount: Math.max(0, Number(t.minCount || 0)),
    type: fixedType,
    value: fixedType === "free" ? 0 : (Number.isFinite(value) ? value : 0)
  };
}

function getBestDiscountForCount(count) {
  const tiers = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  const sorted = tiers
    .map(normalizeDiscountTier)
    .filter(t => Number(t.minCount || 0) > 0)
    .slice()
    .sort((a, b) => Number(a.minCount) - Number(b.minCount));
  let best = null;
  for (const t of sorted) if (count >= Number(t.minCount || 0)) best = t;
  return best;
}

// “Discount to apply” for a client:
// - If you selected an override on their profile → use that
// - Else → best tier by tattoo count
function getDiscountForClient(name) {
  const key = clientKey(name);
  const overrideTierId = (clientDiscountOverrides[key] && clientDiscountOverrides[key].tierId) ? String(clientDiscountOverrides[key].tierId) : "";
  const tiers = (Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : []).map(normalizeDiscountTier);

  if (overrideTierId) {
    const found = tiers.find(t => t.id === overrideTierId);
    if (found) return { ...found, source: "override" };
  }

  const cnt = getClientTattooCount(name);
  const best = getBestDiscountForCount(cnt);
  return best ? { ...normalizeDiscountTier(best), source: "auto" } : null;
}

function discountToText(d) {
  if (!d) return "—";
  if (d.type === "free") return `FREE (${d.source === "override" ? "set" : "auto"})`;
  if (d.type === "static") return `${money(d.value)} off (${d.source === "override" ? "set" : "auto"})`;
  return `${Number(d.value || 0)}% off (${d.source === "override" ? "set" : "auto"})`;
}

// Reminders: any BOOKED entry today+ counts as upcoming appointment
function getUpcomingBookedForClient(name) {
  const key = clientKey(name);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return entries
    .filter(e => clientKey(e.client) === key)
    .filter(e => (e.status || "").toLowerCase() === "booked")
    .filter(e => {
      const d = parseLocalDate(e.date);
      return d && d >= today;
    })
    .slice()
    .sort((a, b) => {
      const da = parseLocalDate(a.date) || new Date(0);
      const db = parseLocalDate(b.date) || new Date(0);
      return da - db;
    });
}

function getClientNetTotal(name) {
  return getClientEntries(name).reduce((sum, e) => sum + totalForTotalsNet(e), 0);
}

function getClientProgressSnapshot(name) {
  const cnt = getClientTattooCount(name);
  const level = getBestLevelForCount(cnt);
  const disc = getDiscountForClient(name);
  return {
    tattooCount: cnt,
    levelId: level ? level.id : "",
    levelName: level ? level.name : "",
    levelPng: level ? (level.pngDataUrl || "") : "",
    discountTierId: disc ? disc.id : "",
    discountText: discountToText(disc),
    discountSource: disc ? disc.source : ""
  };
}

function maybeNotifyClientProgress(name, before, after) {
  if (!before || !after) return;

  const total = money(getClientNetTotal(name));

  if (before.levelId !== after.levelId && after.levelId) {
    pushToast({
      title: `New Badge — ${after.levelName}`,
      sub: `${name} hit ${after.tattooCount} tattoos.`,
      mini: `Total: ${total}`,
      imgDataUrl: after.levelPng || "",
      actionLabel: "View Client",
      actionFn: () => openClientProfile(name)
    });
  }

  // only toast discount if it changed AND it’s from auto tiers (overrides are manual)
  if (before.discountTierId !== after.discountTierId && after.discountTierId && after.discountSource === "auto") {
    pushToast({
      title: `Discount Unlocked`,
      sub: `${name}: ${after.discountText.replace(/\s*$begin:math:text$auto$end:math:text$/, "")}`,
      mini: `Total: ${total}`,
      imgDataUrl: after.levelPng || "",
      actionLabel: "View Client",
      actionFn: () => openClientProfile(name)
    });
  }
}

function badgeHtmlForClient(name) {
  const snap = getClientProgressSnapshot(name);
  if (!snap.levelId) return "";
  const img = snap.levelPng ? `<img src="${snap.levelPng}" alt="badge">` : "";
  return `<span class="client-badge" title="Badge level">${img}${snap.levelName} (${snap.tattooCount})</span>`;
}

// ================= PERSIST =================
function save() {
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}
function saveFilters() { localStorage.setItem("filters", JSON.stringify(filters)); }
function saveFiltersUI() { localStorage.setItem("filtersUI", JSON.stringify(filtersUI)); }
function saveRewardsSettings() { localStorage.setItem("rewardsSettings", JSON.stringify(rewardsSettings)); }
function saveClientOverrides() { localStorage.setItem("clientDiscountOverrides", JSON.stringify(clientDiscountOverrides)); }

// ================= TOASTS =================
function pushToast(toast) {
  toastQueue.push(toast);
  if (!toastTimer) toastTimer = setInterval(flushToast, 250);
}
function flushToast() {
  if (!toastQueue.length) {
    clearInterval(toastTimer);
    toastTimer = null;
    return;
  }
  showToast(toastQueue.shift());
}
function showToast({ title, sub, mini, imgDataUrl, actionLabel, actionFn }) {
  const wrap = safeEl("toasts");
  if (!wrap) return;

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

  if (actionLabel && typeof actionFn === "function") {
    el.querySelector("button").addEventListener("click", () => {
      actionFn();
      el.remove();
    });
  }

  wrap.appendChild(el);
  setTimeout(() => { el.remove(); }, 5500);
}

// ================= MODALS (click off to close) =================
const formModal = safeEl("formModal");
const formBox = safeEl("formBox");
const viewModal = safeEl("viewModal");
const viewBox = safeEl("viewBox");
const exportModal = safeEl("exportModal");
const exportBox = safeEl("exportBox");
const bammerModal = safeEl("bammerModal");
const bammerBox = safeEl("bammerBox");
const depositModal = safeEl("depositModal");
const depositBox = safeEl("depositBox");
const clientModal = safeEl("clientModal");
const clientBox = safeEl("clientBox");
const rewardsModal = safeEl("rewardsModal");
const rewardsBox = safeEl("rewardsBox");
const appointmentsModal = safeEl("appointmentsModal");
const appointmentsBox = safeEl("appointmentsBox");
const studioModal = safeEl("studioModal");
const studioBox = safeEl("studioBox");

function wireModal(modal, box, closer) {
  if (!modal || !box) return;
  modal.addEventListener("click", (e) => { if (e.target === modal) closer(); });
  box.addEventListener("click", (e) => e.stopPropagation());
}
wireModal(formModal, formBox, closeForm);
wireModal(viewModal, viewBox, closeView);
wireModal(exportModal, exportBox, closeExport);
wireModal(bammerModal, bammerBox, closeBammerQuick);
wireModal(depositModal, depositBox, closeDepositQuick);
wireModal(clientModal, clientBox, closeClient);
wireModal(rewardsModal, rewardsBox, closeRewards);
wireModal(appointmentsModal, appointmentsBox, closeAppointments);
wireModal(studioModal, studioBox, closeStudio);

// ================= LOGO =================
function initLogo() {
  const img = safeEl("logoImg");
  const input = safeEl("logoInput");
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
function removeLogo() {
  localStorage.removeItem("logoDataUrl");
  initLogo();
}
initLogo();
window.removeLogo = removeLogo;

// ================= FILTER TOGGLE UI =================
function toggleFilters() {
  filtersUI.open = !filtersUI.open;
  saveFiltersUI();
  applyFiltersUIState();
}
function applyFiltersUIState() {
  const content = safeEl("filtersContent");
  const chev = safeEl("filtersChev");
  if (content) content.style.display = filtersUI.open ? "block" : "none";
  if (chev) chev.textContent = filtersUI.open ? "▴" : "▾";
}
window.toggleFilters = toggleFilters;

// Build a tiny summary string for the Filters header
function updateFiltersSummary() {
  const parts = [];
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  if (filters.status && filters.status !== "all") parts.push(`Status: ${filters.status.toUpperCase()}`);
  if (filters.location && filters.location !== "all") parts.push(`Loc: ${filters.location}`);
  if (filters.from) parts.push(`From: ${filters.from}`);
  if (filters.to) parts.push(`To: ${filters.to}`);
  if (filters.sort && filters.sort !== "newest") parts.push(`Sort: ${filters.sort}`);

  const s = safeEl("filtersSummary");
  if (!s) return;
  s.textContent = parts.length ? `• ${parts.join(" • ")}` : "• none";
}

// ================= STUDIO (Split + Rewards in one window) =================
function openStudio() {
  if (!studioModal) return;

  const def = safeEl("defaultSplitPct");
  if (def) def.value = String(clampPct(splitSettings.defaultPct));

  const list = safeEl("overrideList");
  if (list) {
    const keys = Object.keys(splitSettings.monthOverrides || {}).sort().reverse();
    list.innerHTML = keys.length
      ? keys.map(k => `• <b style="color:var(--gold)">${k}</b> → ${clampPct(splitSettings.monthOverrides[k])}%`).join("<br>")
      : "No monthly overrides yet.";
  }

  studioModal.style.display = "flex";
}
function closeStudio() { if (!studioModal) return; studioModal.style.display = "none"; }
function saveSplitSettings() {
  splitSettings.defaultPct = clampPct(safeVal("defaultSplitPct"));
  localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
  closeStudio();
  render();
}
function saveMonthOverride() {
  const m = safeVal("overrideMonth");
  const pct = clampPct(safeVal("overridePct"));
  if (!m) { alert("Pick a month."); return; }
  splitSettings.monthOverrides = splitSettings.monthOverrides || {};
  splitSettings.monthOverrides[m] = pct;
  localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
  openStudio();
  render();
}
function removeMonthOverride() {
  const m = safeVal("overrideMonth");
  if (!m) { alert("Pick a month."); return; }
  if (splitSettings.monthOverrides && splitSettings.monthOverrides[m] !== undefined) {
    delete splitSettings.monthOverrides[m];
    localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
    openStudio();
    render();
  }
}
window.openStudio = openStudio;
window.closeStudio = closeStudio;
window.saveSplitSettings = saveSplitSettings;
window.saveMonthOverride = saveMonthOverride;
window.removeMonthOverride = removeMonthOverride;

// ================= BACKUP / RESTORE =================
function downloadBackup() {
  const payload = {
    version: 5,
    exportedAt: new Date().toISOString(),
    entries,
    payday,
    splitSettings,
    filters,
    filtersUI,
    rewardsSettings,
    clientDiscountOverrides
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `globbers-ink-log_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function restoreBackup() {
  const input = safeEl("restoreFile");
  const file = input && input.files ? input.files[0] : null;
  if (!file) { alert("Pick a backup JSON file first."); return; }
  if (!confirm("Restore backup? This will overwrite your current data.")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== "object") throw new Error("Invalid backup");
      if (!Array.isArray(data.entries)) throw new Error("Backup missing entries");

      entries = data.entries;

      if (typeof data.payday === "number") {
        payday = data.payday;
        localStorage.setItem("payday", String(payday));
      }
      if (data.splitSettings && typeof data.splitSettings === "object") {
        splitSettings = data.splitSettings;
        localStorage.setItem("splitSettings", JSON.stringify(splitSettings));
      }
      if (data.filters && typeof data.filters === "object") {
        filters = data.filters;
        saveFilters();
      }
      if (data.filtersUI && typeof data.filtersUI === "object") {
        filtersUI = data.filtersUI;
        saveFiltersUI();
      }
      if (data.rewardsSettings && typeof data.rewardsSettings === "object") {
        rewardsSettings = data.rewardsSettings;
        saveRewardsSettings();
      }
      if (data.clientDiscountOverrides && typeof data.clientDiscountOverrides === "object") {
        clientDiscountOverrides = data.clientDiscountOverrides;
        saveClientOverrides();
      }

      localStorage.setItem("entries", JSON.stringify(entries));
      alert("Backup restored ✅");
      closeStudio();
      render();
    } catch (err) {
      alert("Couldn’t restore that file. Make sure it’s a real backup JSON.");
    } finally {
      if (input) input.value = "";
    }
  };
  reader.readAsText(file);
}
window.downloadBackup = downloadBackup;
window.restoreBackup = restoreBackup;

// ================= FILTERS =================
function hydrateFilterUI() {
  const q = safeEl("q");
  const status = safeEl("statusFilter");
  const loc = safeEl("locationFilter");
  const from = safeEl("fromDate");
  const to = safeEl("toDate");
  const sort = safeEl("sortFilter");

  if (q) q.value = filters.q || "";
  if (status) status.value = filters.status || "all";
  if (from) from.value = filters.from || "";
  if (to) to.value = filters.to || "";
  if (sort) sort.value = filters.sort || "newest";
  if (loc) loc.value = filters.location || "all";

  updateFiltersSummary();
  applyFiltersUIState();
}
function applyFilters() {
  filters.q = (safeVal("q") || "").trim();
  filters.status = safeVal("statusFilter") || "all";
  filters.location = safeVal("locationFilter") || "all";
  filters.from = safeVal("fromDate") || "";
  filters.to = safeVal("toDate") || "";
  filters.sort = safeVal("sortFilter") || "newest";
  saveFilters();
  updateFiltersSummary();
  render();
}
function clearFilters() {
  filters = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
  saveFilters();
  hydrateFilterUI();
  render();
}
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

(function wireFilterKeys() {
  const q = safeEl("q");
  if (q) q.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });
})();

function passesFilters(entry) {
  if (filters.status && filters.status !== "all") {
    if ((entry.status || "unpaid") !== filters.status) return false;
  }
  if (filters.location && filters.location !== "all") {
    if ((entry.location || "") !== filters.location) return false;
  }

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
  list.sort((a, b) => filters.sort === "oldest" ? (a.id - b.id) : (b.id - a.id));
  return list;
}

// ================= APPOINTMENTS SCREEN =================
function openAppointments() {
  const modal = safeEl("appointmentsModal");
  if (!modal) return;

  const q = safeEl("apptQ");
  const mode = safeEl("apptMode");
  if (q) q.value = "";
  if (mode) mode.value = "upcoming";

  buildAppointmentsList();
  modal.style.display = "flex";
}
function closeAppointments() {
  const modal = safeEl("appointmentsModal");
  if (!modal) return;
  modal.style.display = "none";
}
function buildAppointmentsList() {
  const listEl = safeEl("appointmentsList");
  if (!listEl) return;

  const q = normalize(safeVal("apptQ")).trim();
  const mode = safeVal("apptMode") || "upcoming";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let booked = entries
    .filter(e => (e.status || "").toLowerCase() === "booked")
    .filter(e => {
      const d = parseLocalDate(e.date);
      if (!d) return false;
      if (mode === "upcoming" && d < today) return false;
      return true;
    });

  if (q) {
    booked = booked.filter(e => {
      const hay = [e.client, e.description, e.location].map(normalize).join(" | ");
      return hay.includes(q);
    });
  }

  booked.sort((a, b) => {
    const da = parseLocalDate(a.date) || new Date(0);
    const db = parseLocalDate(b.date) || new Date(0);
    if (da.getTime() !== db.getTime()) return da - db;
    return (a.id || 0) - (b.id || 0);
  });

  if (!booked.length) {
    listEl.innerHTML = `<div class="summary-box"><div style="opacity:.75;">No booked appointments found.</div></div>`;
    return;
  }

  listEl.innerHTML = booked.map(e => {
    const dep = depositAmount(e);
    const depLine = dep > 0
      ? `<span class="pill gold">Deposit: <b style="color:var(--gold)">${money(dep)}</b></span>`
      : `<span class="pill blue">No deposit set</span>`;

    const row2 = [e.location, e.description].filter(Boolean).join(" • ");
    const badge = badgeHtmlForClient(e.client);

    const d = getDiscountForClient(e.client);
    const discPill = d ? `<span class="pill gold">Discount: <b style="color:var(--gold)">${discountToText(d).replace(/\s*$begin:math:text$\(set\|auto\)$end:math:text$/, "")}</b></span>` : "";

    return `
      <div class="appt-card" onclick="openBookedFromAppointments(${e.id})">
        <div class="appt-top">
          <div class="appt-name">
            <span class="client-link" onclick="event.stopPropagation(); openClientProfile(${JSON.stringify(e.client)})">${e.client}</span>
            ${badge || ``}
            <span class="pill blue">BOOKED</span>
          </div>
          <div class="appt-date">${e.date}</div>
        </div>
        <div class="appt-sub">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            ${depLine}
            ${discPill}
          </div>
          ${row2 ? `<div style="opacity:.92;">${row2}</div>` : ``}
        </div>
      </div>
    `;
  }).join("");
}
function openBookedFromAppointments(id) {
  closeAppointments();
  viewEntry(id);
}
(function wireAppointmentsInputs() {
  const q = safeEl("apptQ");
  const mode = safeEl("apptMode");
  if (q) {
    q.addEventListener("input", () => buildAppointmentsList());
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") buildAppointmentsList(); });
  }
  if (mode) mode.addEventListener("change", () => buildAppointmentsList());
})();
window.openAppointments = openAppointments;
window.closeAppointments = closeAppointments;
window.openBookedFromAppointments = openBookedFromAppointments;

// ================= PAYDAY WINDOW + EXPORT =================
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

function openExport() {
  if (!exportModal) return;

  const paydaySelect = safeEl("paydaySelect");
  if (paydaySelect) paydaySelect.value = String(payday);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const exportStart = safeEl("exportStart");
  const exportEnd = safeEl("exportEnd");
  if (exportStart) exportStart.value = formatYYYYMMDD(start);
  if (exportEnd) exportEnd.value = formatYYYYMMDD(end);

  const w = getWeekWindowFromDate(now);
  payPeriodAnchor = new Date(w.start);
  updatePayPeriodUI();

  const summaryOut = safeEl("summaryOut");
  if (summaryOut) summaryOut.innerHTML = "";

  exportModal.style.display = "flex";
}
function closeExport() { if (!exportModal) return; exportModal.style.display = "none"; }
(function initPaydaySelect() {
  const paydaySelect = safeEl("paydaySelect");
  if (!paydaySelect) return;

  paydaySelect.value = String(payday);
  paydaySelect.addEventListener("change", function () {
    payday = Number(this.value);
    localStorage.setItem("payday", String(payday));

    const base = payPeriodAnchor ? new Date(payPeriodAnchor) : new Date();
    const w = getWeekWindowFromDate(base);
    payPeriodAnchor = new Date(w.start);
    updatePayPeriodUI();

    render();
  });
})();
function updatePayPeriodUI() {
  const ppStart = safeEl("ppStart");
  const ppEnd = safeEl("ppEnd");
  if (!ppStart || !ppEnd) return;

  const anchor = payPeriodAnchor ? new Date(payPeriodAnchor) : new Date();
  const w = getWeekWindowFromDate(anchor);
  ppStart.value = formatYYYYMMDD(w.start);
  ppEnd.value = formatYYYYMMDD(w.end);
}
function prevPayPeriod() {
  if (!payPeriodAnchor) payPeriodAnchor = new Date();
  const d = new Date(payPeriodAnchor);
  d.setDate(d.getDate() - 7);
  payPeriodAnchor = d;
  updatePayPeriodUI();
}
function nextPayPeriod() {
  if (!payPeriodAnchor) payPeriodAnchor = new Date();
  const d = new Date(payPeriodAnchor);
  d.setDate(d.getDate() + 7);
  payPeriodAnchor = d;
  updatePayPeriodUI();
}
window.openExport = openExport;
window.closeExport = closeExport;
window.prevPayPeriod = prevPayPeriod;
window.nextPayPeriod = nextPayPeriod;

// ================= MAIN FORM =================
function openForm() {
  editingId = null;
  const title = safeEl("formTitle");
  if (title) title.textContent = "Add Entry";

  if (!formModal) return;
  formModal.style.display = "flex";

  const dateEl = safeEl("date");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  const statusEl = safeEl("status");
  if (statusEl) statusEl.value = "unpaid";

  if (prefillClient) {
    const c = safeEl("client"); if (c) c.value = prefillClient.client || "";
    const ct = safeEl("contact"); if (ct) ct.value = prefillClient.contact || "";
    const s = safeEl("social"); if (s) s.value = prefillClient.social || "";
    prefillClient = null;
  }
}
function resetForm() {
  const modal = safeEl("formModal");
  if (!modal) return;

  modal.querySelectorAll("input, textarea, select").forEach(el => {
    if (el.type === "file") el.value = "";
    else el.value = "";
  });

  const sessions = safeEl("sessions");
  if (sessions) sessions.innerHTML = "";
}
function closeForm() {
  if (!formModal) return;
  formModal.style.display = "none";
  resetForm();
  editingId = null;
}
function addSession() {
  const container = safeEl("sessions");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount">
    <input type="text" class="session-note" placeholder="Session Note (optional)">
  `;
  container.appendChild(row);
}
window.openForm = openForm;
window.closeForm = closeForm;
window.addSession = addSession;

// ================= QUICK ADD: BAMMER =================
function openBammerQuick() {
  if (!bammerModal) return;
  safeEl("bDate").value = new Date().toISOString().split("T")[0];
  safeEl("bClient").value = prefillClient?.client || "";
  safeEl("bDesc").value = "";
  safeEl("bLocation").value = "";
  safeEl("bTotal").value = "";
  safeEl("bStatus").value = "paid";
  prefillClient = null;
  bammerModal.style.display = "flex";
}
function closeBammerQuick() { if (!bammerModal) return; bammerModal.style.display = "none"; }
function saveBammer() {
  const date = safeVal("bDate");
  const client = (safeVal("bClient") || "").trim();
  const total = Number(safeVal("bTotal") || 0);
  if (!date || !client) { alert("Date + Client required."); return; }

  const before = getClientProgressSnapshot(client);

  entries.push({
    id: Date.now(),
    date,
    client,
    contact: "",
    social: "",
    description: safeVal("bDesc") || "",
    location: safeVal("bLocation") || "",
    notes: "",
    total,
    payments: [],
    status: safeVal("bStatus") || "paid",
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  });

  save();
  closeBammerQuick();

  const after = getClientProgressSnapshot(client);
  maybeNotifyClientProgress(client, before, after);
}
window.openBammerQuick = openBammerQuick;
window.closeBammerQuick = closeBammerQuick;
window.saveBammer = saveBammer;

// ================= QUICK ADD: DEPOSIT ONLY =================
function openDepositQuick() {
  if (!depositModal) return;
  safeEl("dDate").value = new Date().toISOString().split("T")[0];
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
function closeDepositQuick() { if (!depositModal) return; depositModal.style.display = "none"; }
function saveDepositOnly() {
  const date = safeVal("dDate");
  const client = (safeVal("dClient") || "").trim();
  const dep = Number(safeVal("dDeposit") || 0);
  if (!date || !client) { alert("Date + Client required."); return; }
  if (!(dep > 0)) { alert("Deposit amount must be > 0."); return; }

  const total = Number(safeVal("dTotal") || 0);

  entries.push({
    id: Date.now(),
    date,
    client,
    contact: safeVal("dContact") || "",
    social: safeVal("dSocial") || "",
    description: safeVal("dDesc") || "",
    location: safeVal("dLocation") || "",
    notes: "",
    total,
    payments: [{ amount: dep, kind: "deposit", note: "" }],
    status: "booked",
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    editHistory: []
  });

  save();
  closeDepositQuick();
}
window.openDepositQuick = openDepositQuick;
window.closeDepositQuick = closeDepositQuick;
window.saveDepositOnly = saveDepositOnly;

// ================= EDIT HISTORY + EDIT FORM FILL =================
function diffFields(oldEntry, newEntry) {
  const fields = ["date", "client", "contact", "social", "description", "location", "notes", "total", "status"];
  const changes = [];

  for (const f of fields) {
    const oldV = (oldEntry[f] ?? "");
    const newV = (newEntry[f] ?? "");
    if (String(oldV) !== String(newV)) {
      changes.push({ field: f, oldValue: oldV, newValue: newV });
    }
  }

  const oldPaid = paidAmount(oldEntry);
  const newPaid = paidAmount(newEntry);
  const oldDep = depositAmount(oldEntry);
  const newDep = depositAmount(newEntry);

  if (oldPaid !== newPaid || oldDep !== newDep) {
    changes.push({
      field: "payments",
      oldValue: `paidSoFar=${oldPaid}, deposit=${oldDep}`,
      newValue: `paidSoFar=${newPaid}, deposit=${newDep}`
    });
  }

  const oldHas = !!oldEntry.image;
  const newHas = !!newEntry.image;
  if (oldHas !== newHas) {
    changes.push({ field: "image", oldValue: oldHas ? "has image" : "no image", newValue: newHas ? "has image" : "no image" });
  }

  return changes;
}

function fillFormForEdit(entry) {
  editingId = entry.id;

  const title = safeEl("formTitle");
  if (title) title.textContent = "Edit Entry";

  if (!formModal) return;
  formModal.style.display = "flex";

  const set = (id, val) => { const el = safeEl(id); if (el) el.value = (val ?? ""); };

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
  if (sessions) sessions.innerHTML = "";

  set("deposit", depositAmount(entry));

  const sessionPays = paymentsArray(entry).filter(p => p.kind !== "deposit");
  sessionPays.forEach(p => {
    addSession();
    const amounts = document.querySelectorAll(".session-amount");
    const notes = document.querySelectorAll(".session-note");
    const idx = amounts.length - 1;
    if (amounts[idx]) amounts[idx].value = Number(p.amount || 0);
    if (notes[idx]) notes[idx].value = p.note || "";
  });
}

// ================= SAVE ENTRY (ADD/EDIT) =================
function saveEntry() {
  const dateVal = safeVal("date");
  const clientVal = (safeVal("client") || "").trim();
  if (!dateVal || !clientVal) {
    alert("Date and Client Name are required.");
    return;
  }

  const before = getClientProgressSnapshot(clientVal);

  const payments = [];

  const depositVal = Number(safeVal("deposit") || 0);
  if (depositVal > 0) payments.push({ amount: depositVal, kind: "deposit" });

  const sessionAmounts = document.querySelectorAll(".session-amount");
  const sessionNotes = document.querySelectorAll(".session-note");
  sessionAmounts.forEach((input, i) => {
    const val = Number(input.value || 0);
    if (val > 0) {
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
    contact: safeVal("contact") || "",
    social: safeVal("social") || "",
    description: safeVal("description") || "",
    location: safeVal("location") || "",
    notes: safeVal("notes") || "",
    total: Number(safeVal("total") || 0),
    payments,
    status: safeVal("status") || "unpaid"
  };

  const imageEl = safeEl("image");
  const file = imageEl && imageEl.files ? imageEl.files[0] : null;

  const applyAndSave = (newImageDataUrlOrNull) => {
    if (editingId) {
      const idx = entries.findIndex(e => e.id === editingId);
      if (idx === -1) { closeForm(); return; }

      const old = entries[idx];
      const next = Object.assign({}, old, base);
      next.image = newImageDataUrlOrNull ? newImageDataUrlOrNull : (old.image || null);

      const ts = new Date().toISOString();
      if (!Array.isArray(next.editHistory)) next.editHistory = [];
      const changes = diffFields(old, next);
      next.editHistory.push({ timestamp: ts, changes: changes.length ? changes : [{ field: "(no changes)", oldValue: "", newValue: "" }] });
      next.updatedAt = ts;

      entries[idx] = next;
      save();
      closeForm();

      const after = getClientProgressSnapshot(clientVal);
      maybeNotifyClientProgress(clientVal, before, after);
    } else {
      entries.push(Object.assign({}, base, {
        id: Date.now(),
        image: newImageDataUrlOrNull || null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        editHistory: []
      }));
      save();
      closeForm();

      const after = getClientProgressSnapshot(clientVal);
      maybeNotifyClientProgress(clientVal, before, after);
    }
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => applyAndSave(e.target.result);
    reader.readAsDataURL(file);
  } else {
    applyAndSave(null);
  }
}
window.saveEntry = saveEntry;

// ================= CLIENT PROFILES =================
function guessLatestField(list, field) {
  for (const e of list) {
    const v = (e[field] || "").trim();
    if (v) return v;
  }
  return "";
}

function setClientDiscountOverride(name, tierId) {
  const key = clientKey(name);
  clientDiscountOverrides[key] = { tierId: String(tierId || "") };
  saveClientOverrides();
}

function openClientProfile(name) {
  if (!clientModal || !clientBox) return;
  const list = getClientEntries(name);
  if (!list.length) { alert("No entries found for that client."); return; }

  const displayName = list[0].client;

  let total = 0;
  const statusCounts = { booked: 0, paid: 0, partial: 0, unpaid: 0, no_show: 0 };
  list.forEach(e => {
    total += totalForTotalsNet(e);
    const s = (e.status || "unpaid").toLowerCase();
    if (statusCounts[s] !== undefined) statusCounts[s]++;
  });

  const lastDate = list[0].date;
  const contact = guessLatestField(list, "contact");
  const social = guessLatestField(list, "social");

  const snap = getClientProgressSnapshot(displayName);
  const badge = badgeHtmlForClient(displayName);

  const upcoming = getUpcomingBookedForClient(displayName);
  const upcomingBanner = upcoming.length
    ? `
      <div class="summary-box" style="border-color: rgba(42,91,215,.65);">
        <div style="font-weight:900;color:var(--gold);">Upcoming appointment reminder</div>
        <div class="hint">This client has BOOKED appointment(s). Don’t forget to apply the discount on the total if needed.</div>
        <div style="margin-top:8px;">
          ${upcoming.slice(0, 3).map(a => {
            const dep = depositAmount(a);
            return `<div>• <b style="color:var(--gold)">${a.date}</b> ${dep > 0 ? `— Deposit ${money(dep)}` : ""}</div>`;
          }).join("")}
          ${upcoming.length > 3 ? `<div class="hint" style="margin-top:6px;">+${upcoming.length - 3} more…</div>` : ``}
        </div>
      </div>
    `
    : "";

  const tiers = (Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : []).map(normalizeDiscountTier);
  const key = clientKey(displayName);
  const overrideId = (clientDiscountOverrides[key] && clientDiscountOverrides[key].tierId) ? clientDiscountOverrides[key].tierId : "";

  clientBox.innerHTML = `
    <div class="modal-title">Client — ${displayName}</div>

    ${upcomingBanner}

    <div class="summary-box" style="margin-top:${upcoming.length ? "10px" : "0"};">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div>${badge || `<span class="hint">No badge yet</span>`}</div>
        <div class="hint">Tattoo count: <b style="color:var(--gold)">${snap.tattooCount}</b></div>
      </div>

      <div style="margin-top:10px;">
        <div style="font-weight:900;color:var(--gold);">Discount to apply</div>
        <div class="hint">Pick one for this client (override). Leave “Auto” to use your tier rules.</div>
        <select id="clientDiscountSelect">
          <option value="">Auto (by tiers)</option>
          <option value="__none__" ${overrideId === "__none__" ? "selected" : ""}>None</option>
          ${tiers.map(t => {
            const label = t.type === "free" ? `FREE` : t.type === "static" ? `${money(t.value)} off` : `${Number(t.value || 0)}% off`;
            const txt = `${t.label} — ${label} (min ${t.minCount})`;
            const sel = overrideId === t.id ? "selected" : "";
            return `<option value="${t.id}" ${sel}>${txt}</option>`;
          }).join("")}
        </select>
        <div class="hint" style="margin-top:6px;">Current: <b style="color:var(--gold)">${snap.discountText}</b></div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-box">
        <div style="font-weight:900;color:var(--gold);">Totals</div>
        <div>Total: <strong>${money(total)}</strong></div>
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
      ${list.slice(0, 30).map(e => {
        const paidLine = money(paidForPreview(e));
        const row2 = [e.location, e.description].filter(Boolean).join(" • ");
        return `
          <div class="client-entry" onclick="openEntryFromClient(${e.id})">
            <div class="top">
              <div><strong>${String(e.status || "").toUpperCase()}</strong> — Paid: ${paidLine}</div>
              <div class="date">${e.date}</div>
            </div>
            <div class="desc">${row2 || ""}</div>
          </div>
        `;
      }).join("")}
      ${list.length > 30 ? `<div class="hint" style="margin-top:8px;">Showing newest 30…</div>` : ``}
    </div>

    <div class="actions-row">
      <button type="button" class="secondarybtn" onclick="closeClient()">Close</button>
    </div>
  `;

  // wire select
  const sel = safeEl("clientDiscountSelect");
  if (sel) {
    // set selected state correctly
    if (overrideId === "") sel.value = "";
    else sel.value = overrideId;

    sel.addEventListener("change", () => {
      const v = sel.value;
      if (v === "__none__") setClientDiscountOverride(displayName, "__none__");
      else if (!v) setClientDiscountOverride(displayName, ""); // auto
      else setClientDiscountOverride(displayName, v);

      // refresh the modal so “Current:” updates
      openClientProfile(displayName);
    });
  }

  prefillClient = { client: displayName, contact, social };
  clientModal.style.display = "flex";
}

function closeClient() { if (!clientModal) return; clientModal.style.display = "none"; }
function openEntryFromClient(id) { closeClient(); viewEntry(id); }
function repeatClientFull() { if (!prefillClient) return; closeClient(); openForm(); }
function repeatClientBammer() { if (!prefillClient) return; closeClient(); openBammerQuick(); }
function repeatClientDeposit() { if (!prefillClient) return; closeClient(); openDepositQuick(); }

window.openClientProfile = openClientProfile;
window.closeClient = closeClient;
window.openEntryFromClient = openEntryFromClient;
window.repeatClientFull = repeatClientFull;
window.repeatClientBammer = repeatClientBammer;
window.repeatClientDeposit = repeatClientDeposit;

// ================= VIEW / EDIT / DELETE =================
function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry || !viewBox) return;

  viewingId = id;

  const paidSoFar = paidAmount(entry);
  const dep = depositAmount(entry);
  const remaining = Number(entry.total || 0) - paidSoFar;

  const showPaymentsSection = hasAnyPayments(entry);
  const showDepositLine = dep > 0;
  const showConvert = isDepositOnlyEntry(entry);

  let historyHtml = "<p style='opacity:.7;'>No edits yet.</p>";
  if (Array.isArray(entry.editHistory) && entry.editHistory.length) {
    historyHtml = entry.editHistory
      .slice()
      .reverse()
      .map(h => {
        const list = (h.changes || []).map(c => {
          return `<li><strong>${c.field}:</strong> "${String(c.oldValue)}" → "${String(c.newValue)}"</li>`;
        }).join("");
        return `<div style="margin-top:10px;">
          <div style="opacity:.85;"><strong>${h.timestamp}</strong></div>
          <ul style="margin:6px 0 0 18px;">${list}</ul>
        </div>`;
      }).join("");
  }

  const badge = badgeHtmlForClient(entry.client);
  const disc = getDiscountForClient(entry.client);
  const discLine = disc ? `<p><strong>Discount to apply:</strong> ${discountToText(disc)}</p>` : "";

  viewBox.innerHTML = `
    <div class="modal-title">
      <span class="client-link" onclick="openClientProfile(${JSON.stringify(entry.client)})">${entry.client}</span>
      ${badge ? `&nbsp;${badge}` : ``}
      — ${entry.date}
    </div>

    <div class="row">
      <div>
        <p><strong>Status:</strong> <span class="status ${entry.status}">${entry.status}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${showDepositLine ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
        ${discLine}
      </div>
      <div>
        <p><strong>Location:</strong> ${entry.location || ""}</p>
      </div>
    </div>

    <hr>

    <p><strong>Description:</strong> ${entry.description || ""}</p>
    ${entry.contact ? `<p><strong>Contact:</strong> ${entry.contact}</p>` : ``}
    ${entry.social ? `<p><strong>Social:</strong> ${entry.social}</p>` : ``}
    ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ``}

    ${showPaymentsSection ? `
      <h4>Payments</h4>
      <ul>
        ${paymentsArray(entry).filter(p => Number(p.amount || 0) > 0).map(p => {
          const label = p.kind ? `(${p.kind})` : "";
          const note = p.note ? ` — ${p.note}` : "";
          return `<li>${money(p.amount)} ${label}${note}</li>`;
        }).join("")}
      </ul>

      <details style="margin-top:12px;">
        <summary>More details</summary>
        <div style="margin-top:10px;">
          <p><strong>Paid So Far:</strong> ${money(paidSoFar)}</p>
          ${Number(entry.total || 0) > 0 ? `<p><strong>Remaining:</strong> ${money(remaining)}</p>` : ``}
        </div>
      </details>
    ` : ``}

    ${entry.image ? `<img src="${entry.image}" style="width:100%; margin-top:15px; border-radius:12px; border:1px solid rgba(212,175,55,.3);">` : ""}

    <details style="margin-top:12px;">
      <summary>Edit History</summary>
      ${historyHtml}
    </details>

    <div class="actions-row" style="margin-top:20px;">
      ${showConvert ? `<button type="button" onclick="convertDepositToTattoo()">Convert Deposit → Full Tattoo</button>` : ``}
      <button type="button" onclick="editFromView()">Edit</button>
      <button type="button" class="dangerbtn" onclick="deleteFromView()">Delete</button>
      <button type="button" class="secondarybtn" onclick="closeView()">Close</button>
    </div>
  `;

  if (viewModal) viewModal.style.display = "flex";
}
function convertDepositToTattoo() {
  if (!viewingId) return;
  const entry = entries.find(e => e.id === viewingId);
  if (!entry) return;

  closeView();
  fillFormForEdit(entry);

  const statusEl = safeEl("status");
  if (statusEl && (!statusEl.value || statusEl.value === "unpaid" || statusEl.value === "booked")) statusEl.value = "partial";
}
function closeView() { if (!viewModal) return; viewModal.style.display = "none"; viewingId = null; }
function editFromView() {
  if (!viewingId) return;
  const entry = entries.find(e => e.id === viewingId);
  if (!entry) return;
  closeView();
  fillFormForEdit(entry);
}
function deleteFromView() {
  if (!viewingId) return;
  const entry = entries.find(e => e.id === viewingId);
  if (!entry) return;

  if (!confirm(`Delete entry for ${entry.client} on ${entry.date}?`)) return;

  entries = entries.filter(e => e.id !== viewingId);
  save();
  closeView();
}
window.viewEntry = viewEntry;
window.closeView = closeView;
window.editFromView = editFromView;
window.deleteFromView = deleteFromView;
window.convertDepositToTattoo = convertDepositToTattoo;

// ================= STATS =================
function updateStats(filteredList) {
  const todayEl = safeEl("todayTotal");
  const weekEl = safeEl("weekTotal");
  const monthEl = safeEl("monthTotal");
  const quarterEl = safeEl("quarterTotal");
  const yearEl = safeEl("yearTotal");
  if (!todayEl) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekWin = getWeekWindowFromDate(now);
  const qNow = currentQuarterIndex(now);

  let today = 0, week = 0, month = 0, quarter = 0, year = 0;

  (filteredList || entries).forEach(entry => {
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

  todayEl.innerText = money(today);
  if (weekEl) weekEl.innerText = money(week);
  if (monthEl) monthEl.innerText = money(month);
  if (quarterEl) quarterEl.innerText = money(quarter);
  if (yearEl) yearEl.innerText = money(year);
}

// ================= CSV EXPORT + SUMMARY =================
function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
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
function exportCSV() {
  const startStr = safeVal("exportStart");
  const endStr = safeVal("exportEnd");
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);

  if (!start || !end) { alert("Pick a start and end date."); return; }
  if (end < start) { alert("End date must be after start date."); return; }

  exportRangeCSV(start, end, `ink-log_${startStr}_to_${endStr}.csv`);
}
function exportPayPeriodCSV() {
  const ppStartStr = safeVal("ppStart");
  const ppEndStr = safeVal("ppEnd");
  const start = parseLocalDate(ppStartStr);
  const end = parseLocalDate(ppEndStr);
  if (!start || !end) { alert("Pay period dates missing."); return; }

  exportRangeCSV(start, end, `pay_period_${ppStartStr}_to_${ppEndStr}.csv`);
}
function exportRangeCSV(start, end, filename) {
  const rows = [];
  rows.push([
    "date", "client", "contact", "social", "description", "location",
    "total_price", "paid_so_far", "deposit",
    "split_pct", "counted",
    "remaining", "status", "notes",
    "discount_to_apply"
  ]);

  entries.forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;
    if (d < start || d > end) return;

    const paidSoFar = paidAmount(e);
    const dep = depositAmount(e);
    const total = Number(e.total || 0);
    const remaining = total - paidSoFar;

    const pct = getSplitPctForDate(e.date);
    const counted = totalForTotalsNet(e);

    const disc = getDiscountForClient(e.client);

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
      pct,
      counted,
      remaining,
      e.status || "",
      e.notes || "",
      disc ? discountToText(disc).replace(/\s*\((set|auto)\)/, "") : ""
    ]);
  });

  downloadCSV(rows, filename);
}
window.exportCSV = exportCSV;
window.exportPayPeriodCSV = exportPayPeriodCSV;

function buildSummary(mode) {
  let start = null;
  let end = null;
  let title = "";

  if (mode === "payperiod") {
    const s = parseLocalDate(safeVal("ppStart"));
    const e = parseLocalDate(safeVal("ppEnd"));
    if (!s || !e) { alert("Pay period dates missing."); return; }
    start = s; end = e;
    title = `Pay Period Summary (${safeVal("ppStart")} → ${safeVal("ppEnd")})`;
  } else {
    const s = parseLocalDate(safeVal("exportStart"));
    const e = parseLocalDate(safeVal("exportEnd"));
    if (!s || !e) { alert("Pick start/end dates."); return; }
    if (e < s) { alert("End date must be after start date."); return; }
    start = s; end = e;
    title = `Date Range Summary (${safeVal("exportStart")} → ${safeVal("exportEnd")})`;
  }

  const filtered = entries.filter(e => {
    const d = parseLocalDate(e.date);
    if (!d) return false;
    return d >= start && d <= end;
  });

  const totalCount = filtered.length;
  let totalCounted = 0;

  const statusCounts = { booked: 0, paid: 0, partial: 0, unpaid: 0, no_show: 0 };
  const clientTotals = {};
  const locationTotals = {};

  filtered.forEach(e => {
    const s = (e.status || "unpaid").toLowerCase();
    if (statusCounts[s] !== undefined) statusCounts[s]++;

    const counted = totalForTotalsNet(e);
    totalCounted += counted;

    const c = (e.client || "Unknown").trim() || "Unknown";
    clientTotals[c] = (clientTotals[c] || 0) + counted;

    const loc = (e.location || "Unknown").trim() || "Unknown";
    locationTotals[loc] = (locationTotals[loc] || 0) + counted;
  });

  function topN(obj, n) {
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  const topClients = topN(clientTotals, 5);
  const topLocs = topN(locationTotals, 5);

  const out = safeEl("summaryOut");
  if (!out) return;

  out.innerHTML = `
    <div style="font-weight:900; color: var(--gold); margin-bottom:8px;">${title}</div>

    <div class="summary-grid">
      <div class="summary-box">
        <div style="font-weight:900;">Totals</div>
        <div>Entries: <strong>${totalCount}</strong></div>
        <div>Total: <strong>${money(totalCounted)}</strong></div>
      </div>

      <div class="summary-box">
        <div style="font-weight:900;">Status Counts</div>
        <div>BOOKED: <strong>${statusCounts.booked}</strong></div>
        <div>PAID: <strong>${statusCounts.paid}</strong></div>
        <div>PARTIAL: <strong>${statusCounts.partial}</strong></div>
        <div>UNPAID: <strong>${statusCounts.unpaid}</strong></div>
        <div>NO SHOW: <strong>${statusCounts.no_show}</strong></div>
      </div>
    </div>

    <div class="summary-grid" style="margin-top:10px;">
      <div class="summary-box">
        <div style="font-weight:900;">Top Clients</div>
        ${topClients.length ? `<ol style="margin:8px 0 0 18px;">${topClients.map(([k, v]) => `<li>${k}: <strong>${money(v)}</strong></li>`).join("")}</ol>` : "<div style='opacity:.75;'>None</div>"}
      </div>

      <div class="summary-box">
        <div style="font-weight:900;">Top Locations</div>
        ${topLocs.length ? `<ol style="margin:8px 0 0 18px;">${topLocs.map(([k, v]) => `<li>${k}: <strong>${money(v)}</strong></li>`).join("")}</ol>` : "<div style='opacity:.75;'>None</div>"}
      </div>
    </div>
  `;
}
window.buildSummary = buildSummary;

// ================= REWARDS MODAL UI (percent/static/free) =================
function openRewards() { if (!rewardsModal) return; buildRewardsUI(); rewardsModal.style.display = "flex"; }
function closeRewards() { if (!rewardsModal) return; rewardsModal.style.display = "none"; }
window.openRewards = openRewards;
window.closeRewards = closeRewards;

function buildRewardsUI() {
  const levelsList = safeEl("levelsList");
  const discountsList = safeEl("discountsList");
  if (!levelsList || !discountsList) return;

  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  const discounts = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];

  levelsList.innerHTML = levels.map(l => {
    const img = l.pngDataUrl ? `<img src="${l.pngDataUrl}" style="width:28px;height:28px;border-radius:8px;border:1px solid rgba(212,175,55,.25);object-fit:cover;background:#16201b;">` : "";
    return `
      <div class="summary-box" data-level="${l.id}" style="margin-top:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${img}
            <div style="font-weight:900;color:var(--gold);">${l.name || "Badge"}</div>
          </div>
          <button type="button" class="secondarybtn" onclick="removeBadgeLevel('${l.id}')">Remove</button>
        </div>
        <div class="row">
          <input type="text" id="lvlName_${l.id}" placeholder="Badge name" value="${(l.name || "").replace(/"/g, "&quot;")}">
          <input type="number" id="lvlMin_${l.id}" placeholder="Min tattoos" value="${Number(l.minCount || 0)}">
        </div>
        <div class="actions-row" style="margin-top:0;">
          <input type="file" id="lvlFile_${l.id}" accept="image/png,image/*" />
          <button type="button" class="secondarybtn" onclick="clearBadgePNG('${l.id}')">Clear PNG</button>
        </div>
        <div class="hint">Upload a PNG to show this badge next to client names.</div>
      </div>
    `;
  }).join("");

  discountsList.innerHTML = discounts.map(d0 => {
    const d = normalizeDiscountTier(d0);
    return `
      <div class="summary-box" data-disc="${d.id}" style="margin-top:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="font-weight:900;color:var(--gold);">${d.label || "Discount"}</div>
          <button type="button" class="secondarybtn" onclick="removeDiscountTier('${d.id}')">Remove</button>
        </div>

        <div class="row">
          <input type="text" id="discLabel_${d.id}" placeholder="Label (e.g. VIP Reward)" value="${(d.label || "").replace(/"/g, "&quot;")}">
          <input type="number" id="discMin_${d.id}" placeholder="Min tattoos" value="${Number(d.minCount || 0)}">
        </div>

        <div class="row">
          <select id="discType_${d.id}">
            <option value="percent" ${d.type === "percent" ? "selected" : ""}>Percent off</option>
            <option value="static" ${d.type === "static" ? "selected" : ""}>Static $ off</option>
            <option value="free" ${d.type === "free" ? "selected" : ""}>Free</option>
          </select>

          <input
            type="number"
            id="discValue_${d.id}"
            placeholder="${d.type === "static" ? "Dollars off (e.g. 20)" : "Percent (e.g. 10)"}"
            value="${d.type === "free" ? 0 : Number(d.value || 0)}"
            ${d.type === "free" ? "disabled" : ""}
          >
        </div>

        <div class="hint">Type controls how you’ll apply it at checkout (reminder). This does not auto-change totals.</div>
      </div>
    `;
  }).join("");

  // wire enable/disable per tier (free disables value)
  discounts.forEach(d0 => {
    const d = normalizeDiscountTier(d0);
    const typeEl = safeEl(`discType_${d.id}`);
    const valEl = safeEl(`discValue_${d.id}`);
    if (typeEl && valEl) {
      typeEl.addEventListener("change", () => {
        const t = (typeEl.value || "percent").toLowerCase();
        valEl.disabled = (t === "free");
        if (t === "free") valEl.value = "0";
        valEl.placeholder = t === "static" ? "Dollars off (e.g. 20)" : "Percent (e.g. 10)";
      });
    }
  });
}

function addBadgeLevel() {
  rewardsSettings.levels = rewardsSettings.levels || [];
  rewardsSettings.levels.push({ id: uid("lvl"), name: "New Badge", minCount: 1, pngDataUrl: "" });
  buildRewardsUI();
}
function removeBadgeLevel(id) {
  rewardsSettings.levels = (rewardsSettings.levels || []).filter(l => l.id !== id);
  buildRewardsUI();
}
function clearBadgePNG(id) {
  const lvl = (rewardsSettings.levels || []).find(l => l.id === id);
  if (lvl) lvl.pngDataUrl = "";
  buildRewardsUI();
}
window.addBadgeLevel = addBadgeLevel;
window.removeBadgeLevel = removeBadgeLevel;
window.clearBadgePNG = clearBadgePNG;

function addDiscountTier() {
  rewardsSettings.discounts = rewardsSettings.discounts || [];
  rewardsSettings.discounts.push({ id: uid("disc"), label: "New Discount", minCount: 1, type: "percent", value: 5 });
  buildRewardsUI();
}
function removeDiscountTier(id) {
  rewardsSettings.discounts = (rewardsSettings.discounts || []).filter(d => d.id !== id);

  // also remove any client overrides pointing to this tier
  Object.keys(clientDiscountOverrides || {}).forEach(k => {
    if (clientDiscountOverrides[k] && clientDiscountOverrides[k].tierId === id) {
      clientDiscountOverrides[k].tierId = "";
    }
  });
  saveClientOverrides();

  buildRewardsUI();
}
window.addDiscountTier = addDiscountTier;
window.removeDiscountTier = removeDiscountTier;

function saveRewards() {
  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  const discounts = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];

  levels.forEach(l => {
    const nameEl = safeEl(`lvlName_${l.id}`);
    const minEl = safeEl(`lvlMin_${l.id}`);
    if (nameEl) l.name = (nameEl.value || "").trim() || "Badge";
    if (minEl) l.minCount = Math.max(0, Number(minEl.value || 0));
  });

  discounts.forEach(d => {
    const labelEl = safeEl(`discLabel_${d.id}`);
    const minEl = safeEl(`discMin_${d.id}`);
    const typeEl = safeEl(`discType_${d.id}`);
    const valEl = safeEl(`discValue_${d.id}`);

    if (labelEl) d.label = (labelEl.value || "").trim() || "Discount";
    if (minEl) d.minCount = Math.max(0, Number(minEl.value || 0));

    const t = typeEl ? (typeEl.value || "percent").toLowerCase() : (d.type || "percent");
    d.type = (t === "percent" || t === "static" || t === "free") ? t : "percent";

    const v = valEl ? Number(valEl.value || 0) : Number(d.value || 0);
    d.value = d.type === "free" ? 0 : (Number.isFinite(v) ? Math.max(0, v) : 0);
    if (d.type === "percent") d.value = Math.min(100, d.value);
  });

  const fileReads = levels.map(l => {
    const fileEl = safeEl(`lvlFile_${l.id}`);
    const file = fileEl && fileEl.files ? fileEl.files[0] : null;
    if (!file) return Promise.resolve();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => { l.pngDataUrl = e.target.result; resolve(); };
      reader.readAsDataURL(file);
    });
  });

  Promise.all(fileReads).then(() => {
    rewardsSettings.levels = (rewardsSettings.levels || []).slice().sort((a, b) => Number(a.minCount || 0) - Number(b.minCount || 0));
    rewardsSettings.discounts = (rewardsSettings.discounts || []).slice().sort((a, b) => Number(a.minCount || 0) - Number(b.minCount || 0));
    saveRewardsSettings();
    pushToast({ title: "Rewards saved", sub: "Discounts now support Percent / Static / Free + client overrides." });
    closeRewards();
    render();
  });
}
window.saveRewards = saveRewards;

// ================= UI BUILDERS =================
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

// ================= RENDER =================
function render() {
  hydrateFilterUI();

  const locationSelect = safeEl("locationFilter");
  if (locationSelect) {
    const current = filters.location || "all";
    const locs = Array.from(new Set(entries.map(e => e.location).filter(Boolean))).sort();
    locationSelect.innerHTML =
      `<option value="all">All Locations</option>` +
      locs.map(l => `<option value="${l}">${l}</option>`).join("");
    locationSelect.value = current;
  }

  const container = safeEl("entries");
  if (!container) return;
  container.innerHTML = "";

  const list = getFilteredEntries();

  if (list.length === 0) {
    container.innerHTML = "<p style='opacity:.65;'>No entries match your filters.</p>";
    updateStats(list);
    return;
  }

  const grouped = {};
  list.forEach(e => {
    const d = parseLocalDate(e.date);
    if (!d) return;

    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    if (!grouped[y]) grouped[y] = {};
    if (!grouped[y][m]) grouped[y][m] = {};
    if (!grouped[y][m][day]) grouped[y][m][day] = [];
    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a, b) => Number(b) - Number(a)).forEach(year => {
    const yearAmt = Object.values(grouped[year])
      .flatMap(mo => Object.values(mo).flat())
      .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

    const yearAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yearAcc.wrap);

    Object.keys(grouped[year]).sort((a, b) => Number(b) - Number(a)).forEach(monthIdx => {
      const monthAmt = Object.values(grouped[year][monthIdx])
        .flat()
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

          row.querySelector(".client-link").addEventListener("click", (ev) => {
            ev.stopPropagation();
            openClientProfile(entry.client);
          });

          row.addEventListener("click", () => viewEntry(entry.id));

          dayAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);

  if (appointmentsModal && appointmentsModal.style.display === "flex") {
    buildAppointmentsList();
  }
}

// ================= INIT =================
render();