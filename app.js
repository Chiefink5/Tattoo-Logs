/* =========================================================
   Globber’s Ink Log — app.js (Automation Phase FULL REWRITE)
   Focus:
   - Auto client stats + level/badge + discount eligibility
   - Appointment reminders + apply-discount shortcuts
   - Keeps: working FABs + modals + core entry flows
   ========================================================= */

/* ===================== STORAGE KEYS ===================== */
const LS = {
  ENTRIES: "entries",
  FILTERS: "filters",
  FILTERS_UI: "filtersUI",
  LOGO: "logoDataUrl",
  PAYDAY: "payday",
  SPLIT: "splitSettings",
  REWARDS: "rewardsSettings",
  CLIENTS: "clientsDB" // computed + overrides live here
};

/* ===================== DEFAULTS ===================== */
const DEFAULT_SPLIT = { defaultPct: 100, monthOverrides: {} };

const DEFAULT_FILTERS = {
  q: "",
  status: "all",
  location: "all",
  from: "",
  to: "",
  sort: "newest"
};

const DEFAULT_FILTERS_UI = { open: false };

/**
 * rewardsSettings
 * - levels: badge ladder by tattoo count
 * - discounts: eligibility rules
 */
const DEFAULT_REWARDS = {
  levels: [
    { id: "lvl1", name: "Rookie", minCount: 1, pngDataUrl: "" },
    { id: "lvl2", name: "Regular", minCount: 5, pngDataUrl: "" },
    { id: "lvl3", name: "VIP", minCount: 10, pngDataUrl: "" }
  ],
  discounts: [
    // type: percent | static | free
    { id: "d1", label: "5% off", minCount: 5, minSpend: 0, type: "percent", value: 5 },
    { id: "d2", label: "$20 off", minCount: 10, minSpend: 0, type: "static", value: 20 },
    { id: "d3", label: "Free small", minCount: 20, minSpend: 0, type: "free", value: 0 }
  ]
};

/* ===================== STATE ===================== */
let entries = safeJsonParse(localStorage.getItem(LS.ENTRIES), []) || [];
let splitSettings = safeJsonParse(localStorage.getItem(LS.SPLIT), DEFAULT_SPLIT) || DEFAULT_SPLIT;
let rewardsSettings = safeJsonParse(localStorage.getItem(LS.REWARDS), DEFAULT_REWARDS) || DEFAULT_REWARDS;

let filters = safeJsonParse(localStorage.getItem(LS.FILTERS), DEFAULT_FILTERS) || DEFAULT_FILTERS;
let filtersUI = safeJsonParse(localStorage.getItem(LS.FILTERS_UI), DEFAULT_FILTERS_UI) || DEFAULT_FILTERS_UI;

let payday = Number(localStorage.getItem(LS.PAYDAY) || 0); // 0=Sun..6=Sat

// Computed client DB (plus overrides)
let clientsDB = safeJsonParse(localStorage.getItem(LS.CLIENTS), { clients: {} }) || { clients: {} };

// UI pointers
let editingId = null;
let viewingId = null;
let prefillClient = null;

/* ===================== DOM HELPERS ===================== */
const $ = (id) => document.getElementById(id);
const normalize = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");
const uid = (p = "id") => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

/* ===================== DATE HELPERS ===================== */
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
function monthName(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
}

/* ===================== MONEY HELPERS ===================== */
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

/* ===================== ENTRY PAYMENT HELPERS ===================== */
function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
function hasSessions(entry) { return paymentsArray(entry).some(p => p.kind === "session" && Number(p.amount || 0) > 0); }
function isDepositOnlyEntry(entry) { return depositAmount(entry) > 0 && !hasSessions(entry) && (entry.status || "").toLowerCase() === "booked"; }

/**
 * Totals logic (your rule, but NOT shown in UI):
 * - PAID    => Total Price
 * - PARTIAL => Paid so far
 * - else    => 0
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

/**
 * Preview “Paid:” line:
 * - PAID    => total price
 * - PARTIAL => paid so far
 * - BOOKED  => deposit amount
 * - else    => 0
 */
function paidForPreview(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

/* ===================== TOASTS ===================== */
function toast(title, sub = "", mini = "", imgDataUrl = "") {
  const root = $("toasts");
  if (!root) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="t-row">
      ${imgDataUrl ? `<img src="${imgDataUrl}" alt="">` : ""}
      <div>
        <div class="t-title">${escapeHtml(title)}</div>
        ${sub ? `<div class="t-sub">${escapeHtml(sub)}</div>` : ""}
        ${mini ? `<div class="t-mini">${escapeHtml(mini)}</div>` : ""}
      </div>
    </div>
  `;

  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  forceCloseAllModals();
  const m = $(id);
  if (m) m.style.display = "flex";
}
function hideModal(id) {
  const m = $(id);
  if (m) m.style.display = "none";
}

function wireModalClickOff(modalId, boxId, onClose) {
  const modal = $(modalId);
  const box = $(boxId);
  if (!modal || !box) return;
  modal.addEventListener("click", (e) => { if (e.target === modal) onClose(); });
  box.addEventListener("click", (e) => e.stopPropagation());
}

/* ===================== LOGO ===================== */
function initLogo() {
  const img = $("logoImg");
  const input = $("logoInput");
  if (!img || !input) return;

  const saved = localStorage.getItem(LS.LOGO);
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
      localStorage.setItem(LS.LOGO, e.target.result);
      img.src = e.target.result;
      input.value = "";
    };
    reader.readAsDataURL(file);
  });
}

/* ===================== AUTOMATION CORE ===================== */
/**
 * Client model stored in clientsDB.clients[clientKey]:
 * {
 *   key, name,
 *   contact, social,
 *   tattooCount,
 *   spendGross, spendNet,
 *   levelId,
 *   levelName,
 *   levelPng,
 *   eligibleDiscountIds: [],
 *   selectedDiscountId: null,
 *   selectedDiscount: {type,value,label} | null,
 *   lastNotifiedLevelId: null,
 *   lastNotifiedDiscountIds: []
 * }
 */

function clientKeyFromName(name) {
  return normalize(name).replace(/\s+/g, " ").trim();
}

function getLevelForCount(count) {
  const levels = Array.isArray(rewardsSettings.levels) ? rewardsSettings.levels : [];
  const sorted = [...levels].sort((a, b) => Number(a.minCount || 0) - Number(b.minCount || 0));
  let chosen = null;
  for (const lvl of sorted) {
    if (Number(count) >= Number(lvl.minCount || 0)) chosen = lvl;
  }
  return chosen; // may be null
}

function isDiscountEligible(rule, stats) {
  const minCount = Number(rule.minCount || 0);
  const minSpend = Number(rule.minSpend || 0);
  return (Number(stats.tattooCount || 0) >= minCount) && (Number(stats.spendGross || 0) >= minSpend);
}

function computeEligibleDiscounts(stats) {
  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  const eligible = rules.filter(r => isDiscountEligible(r, stats));
  // Sort by "value impact" descending (rough heuristic)
  eligible.sort((a, b) => {
    const av = discountSortValue(a);
    const bv = discountSortValue(b);
    return bv - av;
  });
  return eligible;
}

function discountSortValue(rule) {
  const type = String(rule.type || "");
  const v = Number(rule.value || 0);
  if (type === "free") return 999999;
  if (type === "percent") return 1000 + v;
  if (type === "static") return 500 + v;
  return v;
}

function discountLabel(rule) {
  if (!rule) return "";
  if (rule.type === "percent") return `${rule.value}% off`;
  if (rule.type === "static") return `$${Number(rule.value || 0)} off`;
  if (rule.type === "free") return `Free`;
  return rule.label || "Discount";
}

function getDiscountRuleById(id) {
  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  return rules.find(r => r.id === id) || null;
}

function ensureClientsDBShape() {
  if (!clientsDB || typeof clientsDB !== "object") clientsDB = { clients: {} };
  if (!clientsDB.clients || typeof clientsDB.clients !== "object") clientsDB.clients = {};
}

function rebuildClientsDBAndNotify() {
  ensureClientsDBShape();

  // snapshot before
  const before = JSON.parse(JSON.stringify(clientsDB.clients || {}));

  // recompute from entries
  const map = {};

  for (const e of entries) {
    const name = String(e.client || "").trim();
    if (!name) continue;
    const key = clientKeyFromName(name);
    map[key] ||= {
      key,
      name,
      contact: "",
      social: "",
      tattooCount: 0,
      spendGross: 0,
      spendNet: 0
    };

    // prefer latest non-empty contact/social
    if (e.contact) map[key].contact = e.contact;
    if (e.social) map[key].social = e.social;

    // Count tattoos: count entries that are not deposit-only
    if (!isDepositOnlyEntry(e)) {
      map[key].tattooCount += 1;
    }

    // Spend: sum totals-gross rule (PAID total, PARTIAL paid, else 0)
    map[key].spendGross += totalForTotalsGross(e);
    map[key].spendNet += totalForTotalsNet(e);
  }

  // merge overrides + compute levels/discounts
  for (const key of Object.keys(map)) {
    const base = map[key];

    const prev = clientsDB.clients[key] || {};
    const selectedDiscountId = prev.selectedDiscountId || null;
    const lastNotifiedLevelId = prev.lastNotifiedLevelId || null;
    const lastNotifiedDiscountIds = Array.isArray(prev.lastNotifiedDiscountIds) ? prev.lastNotifiedDiscountIds : [];

    const level = getLevelForCount(base.tattooCount);
    const eligibleRules = computeEligibleDiscounts(base);
    const eligibleDiscountIds = eligibleRules.map(r => r.id);

    // If user never selected a discount, auto-suggest "best eligible" (but don’t auto-apply to totals)
    let finalSelectedId = selectedDiscountId;
    if (!finalSelectedId && eligibleRules.length) {
      finalSelectedId = eligibleRules[0].id;
    }

    const finalSelectedRule = finalSelectedId ? getDiscountRuleById(finalSelectedId) : null;

    clientsDB.clients[key] = {
      key,
      name: base.name,
      contact: base.contact || prev.contact || "",
      social: base.social || prev.social || "",
      tattooCount: base.tattooCount,
      spendGross: round2(base.spendGross),
      spendNet: round2(base.spendNet),
      levelId: level ? level.id : null,
      levelName: level ? level.name : "",
      levelPng: level ? (level.pngDataUrl || "") : "",
      eligibleDiscountIds,
      selectedDiscountId: finalSelectedId,
      selectedDiscount: finalSelectedRule
        ? { id: finalSelectedRule.id, type: finalSelectedRule.type, value: finalSelectedRule.value, label: discountLabel(finalSelectedRule) }
        : null,
      lastNotifiedLevelId,
      lastNotifiedDiscountIds
    };
  }

  // keep clients that have no entries? (optional) -> keep if they existed already
  for (const key of Object.keys(clientsDB.clients)) {
    if (!map[key]) {
      // keep old but mark as inactive-ish
      // leave it as-is so you don’t lose manual settings
      clientsDB.clients[key].tattooCount ||= 0;
      clientsDB.clients[key].spendGross ||= 0;
      clientsDB.clients[key].spendNet ||= 0;
      clientsDB.clients[key].eligibleDiscountIds ||= [];
    }
  }

  // notifications: level unlock + discount unlock
  for (const key of Object.keys(clientsDB.clients)) {
    const c = clientsDB.clients[key];
    const prev = before[key] || {};

    // Level up notification
    const newLevelId = c.levelId || null;
    const oldLevelId = prev.levelId || null;

    if (newLevelId && newLevelId !== oldLevelId) {
      // toast once
      toast(
        "New badge unlocked",
        `${c.name} → ${c.levelName}`,
        `Tattoos: ${c.tattooCount}`,
        c.levelPng || ""
      );
      c.lastNotifiedLevelId = newLevelId;
    }

    // Discount unlock notification (new eligible ids)
    const oldElig = new Set((prev.eligibleDiscountIds || []));
    const newly = (c.eligibleDiscountIds || []).filter(id => !oldElig.has(id));
    if (newly.length) {
      const labels = newly.map(id => {
        const r = getDiscountRuleById(id);
        return r ? discountLabel(r) : id;
      }).join(", ");
      toast("Discount unlocked", c.name, labels);
      c.lastNotifiedDiscountIds = Array.from(new Set([...(c.lastNotifiedDiscountIds || []), ...newly]));
    }
  }

  localStorage.setItem(LS.CLIENTS, JSON.stringify(clientsDB));
}

function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

/* ===================== DISCOUNT APPLICATION (REMINDER + OPTIONAL APPLY) ===================== */
/**
 * We do NOT silently change your totals.
 * We provide a per-entry appliedDiscount object if you choose to apply it.
 *
 * entry.appliedDiscount = { id, type, value, label } OR null
 */
function computeDiscountedTotal(entry) {
  // Only applies to PAID/PARTIAL logic when you want the reminder for booked.
  const baseTotal = Number(entry.total || 0);
  const disc = entry.appliedDiscount || null;
  if (!disc) return baseTotal;

  if (disc.type === "free") return 0;

  if (disc.type === "percent") {
    const pct = clampPct(disc.value || 0);
    return Math.max(0, baseTotal * (1 - pct / 100));
  }

  if (disc.type === "static") {
    return Math.max(0, baseTotal - Number(disc.value || 0));
  }

  return baseTotal;
}

function applyClientDiscountToEntry(entryId, clientKey) {
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx < 0) return;

  const c = clientsDB.clients[clientKey];
  if (!c || !c.selectedDiscount) {
    toast("No discount selected", c ? c.name : "Client");
    return;
  }

  entries[idx].appliedDiscount = { ...c.selectedDiscount };
  entries[idx].updatedAt = new Date().toISOString();
  entries[idx].editHistory ||= [];
  entries[idx].editHistory.push({
    at: entries[idx].updatedAt,
    kind: "discount_applied",
    summary: `Applied discount: ${c.selectedDiscount.label}`
  });

  saveEntries();
  rebuildClientsDBAndNotify();
  render();
  toast("Discount applied", entries[idx].client, c.selectedDiscount.label);
}

/* ===================== SAVE HELPERS ===================== */
function saveEntries() {
  localStorage.setItem(LS.ENTRIES, JSON.stringify(entries));
}

/* ===================== FILTERS UI ===================== */
function toggleFilters() {
  filtersUI.open = !filtersUI.open;
  localStorage.setItem(LS.FILTERS_UI, JSON.stringify(filtersUI));
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

/* ===================== RENDER ===================== */
function render() {
  hydrateFilterUI();

  // rebuild location dropdown options
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
                <span class="client-link">${escapeHtml(entry.client)}</span>
                ${renderClientMiniBadges(entry.client)}
              </div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${escapeHtml(row2 || "")}</div>
                ${renderBookedDiscountHint(entry)}
              </div>
            </div>
            <div class="status ${escapeHtml(entry.status || "unpaid")}">${escapeHtml(entry.status || "unpaid")}</div>
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
}

function renderClientMiniBadges(clientName) {
  const key = clientKeyFromName(clientName);
  const c = clientsDB.clients[key];
  if (!c) return "";
  const badge = c.levelName ? `<span class="client-badge">${c.levelPng ? `<img src="${c.levelPng}" alt="">` : ""}${escapeHtml(c.levelName)}</span>` : "";
  return badge;
}

function renderBookedDiscountHint(entry) {
  const status = (entry.status || "").toLowerCase();
  if (status !== "booked") return "";

  const key = clientKeyFromName(entry.client);
  const c = clientsDB.clients[key];
  if (!c) return "";

  const eligible = Array.isArray(c.eligibleDiscountIds) && c.eligibleDiscountIds.length;
  const selected = c.selectedDiscount;

  // Reminder only if eligible and entry doesn't already have appliedDiscount
  if (eligible && selected && !entry.appliedDiscount) {
    return `
      <div class="sub-row" style="margin-top:8px;">
        <span class="pill gold">Eligible: ${escapeHtml(selected.label)}</span>
        <button type="button" class="topBtn" style="padding:6px 10px; border-radius:12px; margin-left:8px;"
          data-applydisc="${entry.id}">
          Apply
        </button>
      </div>
    `;
  }
  return "";
}

/* ===================== ENTRY VIEW / FORM ===================== */
function openForm(existingEntry = null) {
  const box = $("formBox");
  if (!box) return;

  const today = new Date().toISOString().split("T")[0];
  editingId = existingEntry ? existingEntry.id : null;

  const entry = existingEntry || {
    date: today,
    status: "unpaid",
    client: "",
    location: "",
    total: 0,
    contact: "",
    social: "",
    description: "",
    notes: "",
    payments: []
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
      <input id="contact" placeholder="Contact (optional)" value="${escapeHtml(entry.contact || "")}">
      <input id="social" placeholder="Social (optional)" value="${escapeHtml(entry.social || "")}">
    </div>

    <div class="row">
      <textarea id="description" placeholder="Description">${escapeHtml(entry.description || "")}</textarea>
    </div>

    <div class="row">
      <textarea id="notes" placeholder="Notes">${escapeHtml(entry.notes || "")}</textarea>
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

  // prefill if requested (only when adding new)
  if (!existingEntry && prefillClient) {
    if ($("client")) $("client").value = prefillClient.client || "";
    if ($("contact")) $("contact").value = prefillClient.contact || "";
    if ($("social")) $("social").value = prefillClient.social || "";
    prefillClient = null;
  }

  // render existing sessions
  sessions.forEach(s => addSessionRow(s.amount, s.note || ""));

  $("btnAddSession").addEventListener("click", () => addSessionRow());
  $("btnSaveEntry").addEventListener("click", saveEntry);
  $("btnCloseForm").addEventListener("click", closeForm);

  showModal("formModal");
}

function opt(val, label, current) {
  const sel = String(current || "").toLowerCase() === val ? "selected" : "";
  return `<option value="${val}" ${sel}>${label}</option>`;
}

function closeForm() { hideModal("formModal"); editingId = null; }

function addSessionRow(amount = "", note = "") {
  const container = $("sessions");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount" value="${escapeHtml(amount)}">
    <input type="text" class="session-note" placeholder="Session Note (optional)" value="${escapeHtml(note)}">
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
    status: $("status")?.value || "unpaid",
    total: Number($("total")?.value || 0),
    location: $("location")?.value || "",
    contact: $("contact")?.value || "",
    social: $("social")?.value || "",
    description: $("description")?.value || "",
    notes: $("notes")?.value || "",
    payments
  };

  const nowIso = new Date().toISOString();

  if (editingId) {
    const idx = entries.findIndex(e => e.id === editingId);
    if (idx < 0) { editingId = null; return; }

    const before = entries[idx];
    const changes = diffEntry(before, newData);

    entries[idx] = {
      ...before,
      ...newData,
      updatedAt: nowIso,
      editHistory: Array.isArray(before.editHistory) ? before.editHistory : []
    };

    if (changes.length) {
      entries[idx].editHistory.push({
        at: nowIso,
        kind: "edit",
        summary: changes.join(" • ")
      });
    }

  } else {
    entries.push({
      id: Date.now(),
      ...newData,
      appliedDiscount: null,
      image: null,
      createdAt: nowIso,
      updatedAt: null,
      editHistory: []
    });
  }

  saveEntries();
  closeForm();

  // automation reflow
  rebuildClientsDBAndNotify();
  render();
}

function diffEntry(before, after) {
  const fields = ["date","client","status","total","location","contact","social","description","notes"];
  const out = [];
  for (const f of fields) {
    const b = String(before[f] ?? "");
    const a = String(after[f] ?? "");
    if (b !== a) out.push(`${f}: "${trimForHistory(b)}" → "${trimForHistory(a)}"`);
  }

  const bPay = JSON.stringify(paymentsArray(before));
  const aPay = JSON.stringify(after.payments || []);
  if (bPay !== aPay) out.push(`payments updated`);
  return out;
}

function trimForHistory(s) {
  const t = String(s || "").trim();
  if (t.length <= 24) return t;
  return t.slice(0, 21) + "…";
}

function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  const box = $("viewBox");
  if (!entry || !box) return;

  viewingId = id;

  const dep = depositAmount(entry);
  const paidSoFar = paidAmount(entry);
  const remaining = Math.max(0, Number(entry.total || 0) - paidSoFar);

  const ck = clientKeyFromName(entry.client);
  const c = clientsDB.clients[ck];
  const eligible = c && c.selectedDiscount && (entry.status || "").toLowerCase() === "booked" && !entry.appliedDiscount;

  box.innerHTML = `
    <div class="modal-title">${escapeHtml(entry.client)} — ${escapeHtml(entry.date)}</div>

    <div class="row">
      <div style="width:100%;">
        <p><strong>Status:</strong> <span class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></p>
        <p><strong>Total Price:</strong> ${money(entry.total)}</p>
        ${dep > 0 ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
        ${entry.appliedDiscount ? `<p><strong>Discount Applied:</strong> ${escapeHtml(entry.appliedDiscount.label)}</p>` : ``}
      </div>
      <div style="width:100%;">
        <p><strong>Location:</strong> ${escapeHtml(entry.location || "")}</p>
        ${c && c.levelName ? `<p><strong>Badge:</strong> ${escapeHtml(c.levelName)}</p>` : ``}
      </div>
    </div>

    ${entry.description ? `<p><strong>Description:</strong> ${escapeHtml(entry.description)}</p>` : ``}
    ${entry.contact ? `<p><strong>Contact:</strong> ${escapeHtml(entry.contact)}</p>` : ``}
    ${entry.social ? `<p><strong>Social:</strong> ${escapeHtml(entry.social)}</p>` : ``}
    ${entry.notes ? `<p><strong>Notes:</strong> ${escapeHtml(entry.notes)}</p>` : ``}

    ${eligible ? `
      <div class="summary-box" style="margin-top:12px;">
        <div style="font-weight:900;color:var(--gold,#d4af37);">Discount Reminder</div>
        <div style="margin-top:6px; opacity:.9;">Eligible: <b>${escapeHtml(c.selectedDiscount.label)}</b></div>
        <div class="actions-row" style="margin-top:10px;">
          <button type="button" id="btnApplyDiscount">Apply Discount</button>
          <button type="button" class="secondarybtn" id="btnOpenClient">Open Client</button>
        </div>
      </div>
    ` : ``}

    ${paymentsArray(entry).length ? `
      <h4 style="margin-top:14px;">Payments</h4>
      <ul>
        ${paymentsArray(entry).map(p => `<li>${money(p.amount)} ${p.kind ? `(${escapeHtml(p.kind)})` : ""}${p.note ? ` — ${escapeHtml(p.note)}` : ""}</li>`).join("")}
      </ul>
    ` : ``}

    <details style="margin-top:12px;">
      <summary>More details</summary>
      <div style="margin-top:10px;">
        <p><strong>Paid So Far:</strong> ${money(paidSoFar)}</p>
        ${Number(entry.total || 0) > 0 ? `<p><strong>Remaining:</strong> ${money(remaining)}</p>` : ``}
        ${renderEditHistory(entry)}
      </div>
    </details>

    <div class="actions-row" style="margin-top:16px;">
      <button type="button" id="btnEditEntry">Edit</button>
      <button type="button" class="dangerbtn" id="btnDeleteEntry">Delete</button>
      <button type="button" class="secondarybtn" id="btnCloseView">Close</button>
    </div>
  `;

  $("btnEditEntry").addEventListener("click", () => {
    closeView();
    openForm(entry);
  });

  $("btnDeleteEntry").addEventListener("click", () => deleteEntry(id));
  $("btnCloseView").addEventListener("click", closeView);

  if (eligible) {
    $("btnApplyDiscount").addEventListener("click", () => applyClientDiscountToEntry(entry.id, ck));
    $("btnOpenClient").addEventListener("click", () => openClientProfile(entry.client));
  }

  showModal("viewModal");
}

function renderEditHistory(entry) {
  const hist = Array.isArray(entry.editHistory) ? entry.editHistory : [];
  if (!hist.length) return "";
  const rows = hist.slice().reverse().slice(0, 8).map(h => {
    return `<div style="margin-top:8px; opacity:.9;">
      <div style="font-weight:900;">${escapeHtml(h.kind || "update")}</div>
      <div style="opacity:.85; font-size:13px;">${escapeHtml(h.at || "")}</div>
      <div style="opacity:.9;">${escapeHtml(h.summary || "")}</div>
    </div>`;
  }).join("");
  return `<div style="margin-top:12px;">
    <div style="font-weight:900;color:var(--gold,#d4af37);">Edit History</div>
    ${rows}
  </div>`;
}

function closeView() { hideModal("viewModal"); viewingId = null; }

function deleteEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if (!confirm(`Delete entry for ${entry.client} on ${entry.date}?`)) return;

  entries = entries.filter(e => e.id !== id);
  saveEntries();

  closeView();
  rebuildClientsDBAndNotify();
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

  const nowIso = new Date().toISOString();

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
    appliedDiscount: null,
    image: null,
    createdAt: nowIso,
    updatedAt: null,
    editHistory: []
  });

  saveEntries();
  closeBammerQuick();
  rebuildClientsDBAndNotify();
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

  const nowIso = new Date().toISOString();

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
    appliedDiscount: null,
    image: null,
    createdAt: nowIso,
    updatedAt: null,
    editHistory: []
  });

  saveEntries();
  closeDepositQuick();
  rebuildClientsDBAndNotify();
  render();
}

/* ===================== CLIENT PROFILE (AUTOMATION VIEW) ===================== */
function openClientProfile(clientName) {
  const key = clientKeyFromName(clientName);
  const c = clientsDB.clients[key];
  const box = $("clientBox");
  if (!box) return;

  const name = c?.name || clientName;
  const levelName = c?.levelName || "";
  const count = c?.tattooCount || 0;
  const spend = c?.spendGross || 0;

  const eligibleRules = (c?.eligibleDiscountIds || []).map(id => getDiscountRuleById(id)).filter(Boolean);
  const selectedId = c?.selectedDiscountId || "";
  const selectedRule = selectedId ? getDiscountRuleById(selectedId) : null;

  box.innerHTML = `
    <div class="modal-title">Client Profile</div>

    <div class="summary-box">
      <div style="font-weight:900; font-size:18px;">${escapeHtml(name)}</div>
      ${levelName ? `<div style="margin-top:6px;" class="client-badge">${c.levelPng ? `<img src="${c.levelPng}" alt="">` : ""}${escapeHtml(levelName)}</div>` : ""}
      <div style="margin-top:10px; opacity:.9;">Tattoos: <b>${count}</b> • Spent: <b>${money(spend)}</b></div>
      ${c?.contact ? `<div style="margin-top:6px;opacity:.85;">Contact: ${escapeHtml(c.contact)}</div>` : ""}
      ${c?.social ? `<div style="margin-top:6px;opacity:.85;">Social: ${escapeHtml(c.social)}</div>` : ""}
    </div>

    <div class="summary-box" style="margin-top:12px;">
      <div style="font-weight:900;color:var(--gold,#d4af37);">Discount</div>
      <div style="margin-top:8px;">
        <select id="clientDiscountSelect">
          <option value="">None</option>
          ${eligibleRules.map(r => `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>${escapeHtml(discountLabel(r))}</option>`).join("")}
        </select>
      </div>
      <div class="hint" style="margin-top:8px;">
        Eligible discounts are auto-calculated. Selecting one makes it the default reminder for booked appointments.
      </div>
      <div class="actions-row" style="margin-top:10px;">
        <button type="button" id="btnSaveClientDiscount">Save</button>
      </div>
    </div>

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseClient">Close</button>
    </div>
  `;

  $("btnCloseClient").addEventListener("click", () => closeClient());
  $("btnSaveClientDiscount").addEventListener("click", () => {
    const chosen = $("clientDiscountSelect")?.value || "";
    ensureClientsDBShape();
    clientsDB.clients[key] ||= { key, name: clientName };
    clientsDB.clients[key].selectedDiscountId = chosen || null;

    const rule = chosen ? getDiscountRuleById(chosen) : null;
    clientsDB.clients[key].selectedDiscount = rule
      ? { id: rule.id, type: rule.type, value: rule.value, label: discountLabel(rule) }
      : null;

    localStorage.setItem(LS.CLIENTS, JSON.stringify(clientsDB));
    toast("Client updated", name, chosen ? `Discount set: ${discountLabel(rule)}` : "Discount cleared");
    closeClient();
    rebuildClientsDBAndNotify();
    render();
  });

  showModal("clientModal");
}
function closeClient() { hideModal("clientModal"); }

/* ===================== APPOINTMENTS (WITH DISCOUNT REMINDERS) ===================== */
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
      const ck = clientKeyFromName(e.client);
      const c = clientsDB.clients[ck];
      const hint = c && c.selectedDiscount && !e.appliedDiscount
        ? `<div style="margin-top:8px;">
             <span class="pill gold">Eligible: <b>${escapeHtml(c.selectedDiscount.label)}</b></span>
             <button type="button" class="topBtn" style="padding:6px 10px; border-radius:12px; margin-left:8px;"
               data-appt-apply="${e.id}">
               Apply
             </button>
           </div>`
        : "";

      return `
        <div class="appt-card" data-id="${e.id}">
          <div class="appt-top">
            <div class="appt-name">${escapeHtml(e.client)} <span class="pill blue">BOOKED</span></div>
            <div class="appt-date">${escapeHtml(e.date)}</div>
          </div>
          <div class="appt-sub">
            ${dep > 0 ? `<div class="pill gold">Deposit: <b style="color:var(--gold,#d4af37)">${money(dep)}</b></div>` : ``}
            ${row2 ? `<div style="opacity:.9;">${escapeHtml(row2)}</div>` : ``}
            ${hint}
          </div>
        </div>
      `;
    }).join("") : `<div class="summary-box"><div style="opacity:.75;">No upcoming booked appointments.</div></div>`}

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseAppts">Close</button>
    </div>
  `;

  // open entry view
  box.querySelectorAll(".appt-card").forEach(card => {
    card.addEventListener("click", (ev) => {
      // don’t trigger when clicking Apply
      if (ev.target && ev.target.matches("[data-appt-apply]")) return;
      const id = Number(card.getAttribute("data-id"));
      closeAppointments();
      viewEntry(id);
    });
  });

  // Apply discount buttons
  box.querySelectorAll("[data-appt-apply]").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const entryId = Number(btn.getAttribute("data-appt-apply"));
      const entry = entries.find(x => x.id === entryId);
      if (!entry) return;
      const ck = clientKeyFromName(entry.client);
      applyClientDiscountToEntry(entryId, ck);
      // modal will refresh from render, so close + reopen
      closeAppointments();
      openAppointments();
    });
  });

  $("btnCloseAppts").addEventListener("click", closeAppointments);

  showModal("appointmentsModal");
}
function closeAppointments(){ hideModal("appointmentsModal"); }

/* ===================== STUDIO (LIGHT) ===================== */
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
      <div class="hint">Monthly overrides live in rewards/settings phase (next).</div>
    </div>

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseStudio">Close</button>
    </div>
  `;

  $("btnSaveSplit").addEventListener("click", () => {
    splitSettings.defaultPct = clampPct($("defaultSplitPct")?.value || 100);
    localStorage.setItem(LS.SPLIT, JSON.stringify(splitSettings));
    toast("Studio saved", "Split updated", `${splitSettings.defaultPct}%`);
    closeStudio();
    rebuildClientsDBAndNotify();
    render();
  });

  $("btnCloseStudio").addEventListener("click", closeStudio);

  showModal("studioModal");
}
function closeStudio(){ hideModal("studioModal"); }

/* ===================== EXPORT (STUB, STILL WORKS) ===================== */
function openExport() {
  const box = $("exportBox");
  if (!box) return;
  box.innerHTML = `
    <div class="modal-title">Export</div>
    <div class="summary-box">
      <div style="opacity:.85;">Export suite polish is the next phase (CSV + pay period + next/prev + summary).</div>
    </div>
    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseExport">Close</button>
    </div>
  `;
  $("btnCloseExport").addEventListener("click", closeExport);
  showModal("exportModal");
}
function closeExport(){ hideModal("exportModal"); }

/* ===================== FAB WIRING (BULLETPROOF) ===================== */
function bindFABs() {
  const addBtn = $("fabAdd");
  const depBtn = $("fabDeposit");
  const bamBtn = $("fabBammer");

  if (addBtn) addBtn.addEventListener("click", (e) => { e.preventDefault(); openForm(); });
  if (depBtn) depBtn.addEventListener("click", (e) => { e.preventDefault(); openDepositQuick(); });
  if (bamBtn) bamBtn.addEventListener("click", (e) => { e.preventDefault(); openBammerQuick(); });

  const main = document.querySelector(".fab.main");
  const smalls = Array.from(document.querySelectorAll(".fab.small"));

  if (!addBtn && main) main.addEventListener("click", (e) => { e.preventDefault(); openForm(); });
  if (!depBtn && smalls[0]) smalls[0].addEventListener("click", (e) => { e.preventDefault(); openDepositQuick(); });
  if (!bamBtn && smalls[1]) smalls[1].addEventListener("click", (e) => { e.preventDefault(); openBammerQuick(); });

  const all = [addBtn, depBtn, bamBtn, main, smalls[0], smalls[1]].filter(Boolean);
  all.forEach(btn => {
    btn.addEventListener("touchend", (e) => { e.preventDefault(); btn.click(); }, { passive: false });
  });
}

/* ===================== GLOBAL CLICK HOOKS (DISCOUNT APPLY IN LIST) ===================== */
function bindGlobalDelegates() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;

    // List-card Apply button (rendered inside entries)
    if (t.matches("[data-applydisc]")) {
      e.stopPropagation();
      const entryId = Number(t.getAttribute("data-applydisc"));
      const entry = entries.find(x => x.id === entryId);
      if (!entry) return;
      const ck = clientKeyFromName(entry.client);
      applyClientDiscountToEntry(entryId, ck);
    }
  });
}

/* ===================== INIT ===================== */
function init() {
  // modal click-off wiring
  wireModalClickOff("formModal","formBox",closeForm);
  wireModalClickOff("viewModal","viewBox",closeView);
  wireModalClickOff("exportModal","exportBox",closeExport);
  wireModalClickOff("bammerModal","bammerBox",closeBammerQuick);
  wireModalClickOff("depositModal","depositBox",closeDepositQuick);
  wireModalClickOff("appointmentsModal","appointmentsBox",closeAppointments);
  wireModalClickOff("studioModal","studioBox",closeStudio);
  wireModalClickOff("clientModal","clientBox",closeClient);

  initLogo();

  $("q")?.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilters(); });

  bindFABs();
  bindGlobalDelegates();

  // Automation pass at boot
  rebuildClientsDBAndNotify();

  render();
}

document.addEventListener("DOMContentLoaded", init);

/* ===================== WINDOW EXPORTS ===================== */
window.openForm = () => openForm(null);
window.openDepositQuick = openDepositQuick;
window.openBammerQuick = openBammerQuick;

window.openAppointments = openAppointments;
window.openStudio = openStudio;
window.openExport = openExport;

window.toggleFilters = toggleFilters;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

window.viewEntry = viewEntry;
window.openClientProfile = openClientProfile;