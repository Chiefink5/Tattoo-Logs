/* =========================================================
   Globber’s Ink Log — app.js (Automation + Toast Cards + Discount Builder)
   - Toasts: 10s, card style, close button, timer bar
   - Studio: Split + Discount Builder UI
   - Automation: client stats + badges + discount eligibility + reminders
   ========================================================= */

/* ===================== STORAGE KEYS ===================== */
/* =========================================================
   Globber’s Ink Log — app.js (FAB FIX ONLY, BULLETPROOF)
   - Fixes: PLUS button not responding
   - Uses global delegation (capture) for clicks + touch
   - Does NOT require fragile element-specific binding
   ========================================================= */

/* ----------------- YOUR EXISTING APP CODE STARTS -----------------
   Keep ALL of your existing code as-is below.
   The only “change” is: we add a bulletproof FAB handler that
   will call your existing functions:
     - openForm()
     - openDepositQuick()
     - openBammerQuick()

   If your function names differ, rename them in runFabAction().
------------------------------------------------------------------ */

/* ====== BULLETPROOF FAB DELEGATION (DROP-IN) ====== */
function runFabAction(action) {
  // If your app uses different names, change ONLY these lines:
  if (action === "add" && typeof openForm === "function") openForm(null);
  if (action === "deposit" && typeof openDepositQuick === "function") openDepositQuick();
  if (action === "bammer" && typeof openBammerQuick === "function") openBammerQuick();
}

function detectFabActionFromTarget(target) {
  if (!target || !target.closest) return null;

  // Covers: IDs you’ve used + generic “fab” patterns + data-fab hooks
  const el = target.closest(
    "#fabAdd, #fabDeposit, #fabBammer, .fab.main, .fab.small, [data-fab='add'], [data-fab='deposit'], [data-fab='bammer']"
  );
  if (!el) return null;

  // Explicit IDs / dataset win
  if (el.id === "fabAdd" || el.dataset.fab === "add") return "add";
  if (el.id === "fabDeposit" || el.dataset.fab === "deposit") return "deposit";
  if (el.id === "fabBammer" || el.dataset.fab === "bammer") return "bammer";

  // Class fallback
  if (el.classList.contains("main")) return "add";

  // If you use two .fab.small buttons: first = deposit, second = bammer
  if (el.classList.contains("small")) {
    const smalls = Array.from(document.querySelectorAll(".fab.small"));
    const idx = smalls.indexOf(el);
    if (idx === 0) return "deposit";
    if (idx === 1) return "bammer";
  }

  return null;
}

function installFabDelegation() {
  const handler = (e) => {
    const action = detectFabActionFromTarget(e.target);
    if (!action) return;

    // This is what makes it “unstoppable”
    e.preventDefault();
    e.stopPropagation();

    runFabAction(action);
  };

  // Capture phase = fires even when inner elements/overlays interfere
  document.addEventListener("click", handler, true);

  // Mobile: catch taps that sometimes don’t produce normal click
  document.addEventListener(
    "touchend",
    (e) => {
      const action = detectFabActionFromTarget(e.target);
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      runFabAction(action);
    },
    { capture: true, passive: false }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  installFabDelegation();
});

/* ----------------- YOUR EXISTING APP CODE BELOW -----------------
   Paste your CURRENT working app.js contents below this line.
   Don’t change anything else.
------------------------------------------------------------------ */
const LS = {
  ENTRIES: "entries",
  FILTERS: "filters",
  FILTERS_UI: "filtersUI",
  LOGO: "logoDataUrl",
  PAYDAY: "payday",
  SPLIT: "splitSettings",
  REWARDS: "rewardsSettings",
  CLIENTS: "clientsDB"
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
let clientsDB = safeJsonParse(localStorage.getItem(LS.CLIENTS), { clients: {} }) || { clients: {} };

let editingId = null;
let viewingId = null;
let prefillClient = null;

/* ===================== DOM HELPERS ===================== */
const $ = (id) => document.getElementById(id);
const normalize = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

/* ===================== ENTRY PAYMENT HELPERS ===================== */
function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
function hasSessions(entry) { return paymentsArray(entry).some(p => p.kind === "session" && Number(p.amount || 0) > 0); }
function isDepositOnlyEntry(entry) { return depositAmount(entry) > 0 && !hasSessions(entry) && (entry.status || "").toLowerCase() === "booked"; }

/**
 * Totals rule (NOT displayed in UI):
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

/* ===================== TOASTS (10s + CARD) ===================== */
const TOAST_MS = 10000;

function toastCard(opts) {
  const root = $("toasts");
  if (!root) return;

  const {
    title = "Notification",
    sub = "",
    mini = "",
    imgDataUrl = "",
    icon = "✨",
    tone = "gold" // gold | green | blue | red
  } = (opts || {});

  const toneMap = {
    gold: { border: "rgba(212,175,55,.25)", glow: "rgba(212,175,55,.14)", iconBg: "rgba(212,175,55,.14)", iconRing: "rgba(212,175,55,.35)" },
    green:{ border: "rgba(42,211,111,.25)", glow: "rgba(42,211,111,.12)", iconBg: "rgba(42,211,111,.14)", iconRing: "rgba(42,211,111,.35)" },
    blue: { border: "rgba(42,91,215,.30)", glow: "rgba(42,91,215,.10)", iconBg: "rgba(42,91,215,.14)", iconRing: "rgba(42,91,215,.40)" },
    red:  { border: "rgba(255,60,60,.28)", glow: "rgba(255,60,60,.10)", iconBg: "rgba(255,60,60,.14)", iconRing: "rgba(255,60,60,.38)" }
  };
  const t = toneMap[tone] || toneMap.gold;

  const el = document.createElement("div");
  el.className = "toast";
  el.style.borderColor = t.border;
  el.style.boxShadow = `0 18px 44px rgba(0,0,0,.45), 0 0 0 1px ${t.glow}`;
  el.style.position = "relative";
  el.style.overflow = "hidden";

  el.innerHTML = `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div style="
        width:44px;height:44px;border-radius:14px;
        background:${t.iconBg};
        border:1px solid ${t.iconRing};
        box-shadow: 0 12px 26px rgba(0,0,0,.28);
        display:flex;align-items:center;justify-content:center;
        flex:0 0 44px;
      ">
        ${imgDataUrl
          ? `<img src="${imgDataUrl}" alt="" style="width:34px;height:34px;border-radius:10px;object-fit:cover;">`
          : `<div style="font-size:20px; line-height:1;">${escapeHtml(icon)}</div>`
        }
      </div>

      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div style="font-weight:900; color:var(--gold,#d4af37);">${escapeHtml(title)}</div>
          <button type="button" data-toast-close
            style="
              border:1px solid rgba(255,255,255,.12);
              background: rgba(0,0,0,.18);
              color: rgba(255,255,255,.85);
              padding:6px 10px;border-radius:12px;font-weight:900;
            ">✕</button>
        </div>

        ${sub ? `<div style="opacity:.93; margin-top:4px; word-wrap:break-word;">${escapeHtml(sub)}</div>` : ""}
        ${mini ? `<div style="opacity:.75; margin-top:6px; font-size:12px;">${escapeHtml(mini)}</div>` : ""}
      </div>
    </div>

    <div data-toast-bar style="
      position:absolute; left:0; bottom:0;
      height:3px; width:100%;
      background: ${t.border};
      transform-origin:left;
      transform: scaleX(1);
    "></div>
  `;

  root.appendChild(el);

  const closeBtn = el.querySelector("[data-toast-close]");
  const bar = el.querySelector("[data-toast-bar]");

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.style.transition = "opacity 180ms ease, transform 180ms ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 200);
  };

  if (closeBtn) closeBtn.addEventListener("click", (e) => { e.stopPropagation(); remove(); });

  // animate timer bar
  if (bar) {
    // kick to next frame so transition works
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${TOAST_MS}ms linear`;
      bar.style.transform = "scaleX(0)";
    });
  }

  setTimeout(remove, TOAST_MS);
}

/* ===================== MODALS (SAFE) ===================== */
const MODAL_IDS = [
  "formModal","viewModal","exportModal","bammerModal","depositModal",
  "clientModal","rewardsModal","appointmentsModal","studioModal"
];

function forceCloseAllModals() {
  MODAL_IDS.forEach(id => { const m = $(id); if (m) m.style.display = "none"; });
  editingId = null;
  viewingId = null;
}
function showModal(id) {
  forceCloseAllModals();
  const m = $(id);
  if (m) m.style.display = "flex";
}
function hideModal(id) { const m = $(id); if (m) m.style.display = "none"; }

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
function ensureClientsDBShape() {
  if (!clientsDB || typeof clientsDB !== "object") clientsDB = { clients: {} };
  if (!clientsDB.clients || typeof clientsDB.clients !== "object") clientsDB.clients = {};
}

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
  return chosen;
}

function isDiscountEligible(rule, stats) {
  const minCount = Number(rule.minCount || 0);
  const minSpend = Number(rule.minSpend || 0);
  return (Number(stats.tattooCount || 0) >= minCount) && (Number(stats.spendGross || 0) >= minSpend);
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
  const label = String(rule.label || "").trim();
  if (label) return label;

  if (rule.type === "percent") return `${rule.value}% off`;
  if (rule.type === "static") return `$${Number(rule.value || 0)} off`;
  if (rule.type === "free") return `Free`;
  return "Discount";
}

function getDiscountRuleById(id) {
  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  return rules.find(r => r.id === id) || null;
}

function computeEligibleDiscounts(stats) {
  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  const eligible = rules.filter(r => isDiscountEligible(r, stats));
  eligible.sort((a, b) => discountSortValue(b) - discountSortValue(a));
  return eligible;
}

function rebuildClientsDBAndNotify() {
  ensureClientsDBShape();
  const before = JSON.parse(JSON.stringify(clientsDB.clients || {}));

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

    if (e.contact) map[key].contact = e.contact;
    if (e.social) map[key].social = e.social;

    if (!isDepositOnlyEntry(e)) map[key].tattooCount += 1;

    map[key].spendGross += totalForTotalsGross(e);
    map[key].spendNet += totalForTotalsNet(e);
  }

  for (const key of Object.keys(map)) {
    const base = map[key];

    const prev = clientsDB.clients[key] || {};
    const selectedDiscountId = prev.selectedDiscountId || null;

    const level = getLevelForCount(base.tattooCount);
    const eligibleRules = computeEligibleDiscounts(base);
    const eligibleDiscountIds = eligibleRules.map(r => r.id);

    let finalSelectedId = selectedDiscountId;
    if (!finalSelectedId && eligibleRules.length) finalSelectedId = eligibleRules[0].id;

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
        : null
    };
  }

  // keep any old manual clients around (don’t delete)
  for (const key of Object.keys(clientsDB.clients)) {
    if (!map[key]) {
      clientsDB.clients[key].tattooCount ||= 0;
      clientsDB.clients[key].spendGross ||= 0;
      clientsDB.clients[key].spendNet ||= 0;
      clientsDB.clients[key].eligibleDiscountIds ||= [];
    }
  }

  // notifications: badge unlock + newly eligible discounts
  for (const key of Object.keys(clientsDB.clients)) {
    const c = clientsDB.clients[key];
    const prev = before[key] || {};

    if (c.levelId && c.levelId !== (prev.levelId || null)) {
      toastCard({
        title: "New badge unlocked",
        sub: `${c.name} → ${c.levelName}`,
        mini: `Tattoos: ${c.tattooCount}`,
        imgDataUrl: c.levelPng || "",
        icon: "🏅",
        tone: "gold"
      });
    }

    const oldElig = new Set(prev.eligibleDiscountIds || []);
    const newly = (c.eligibleDiscountIds || []).filter(id => !oldElig.has(id));
    if (newly.length) {
      const labels = newly.map(id => {
        const r = getDiscountRuleById(id);
        return r ? discountLabel(r) : id;
      }).join(", ");
      toastCard({
        title: "Discount unlocked",
        sub: c.name,
        mini: labels,
        icon: "💸",
        tone: "green"
      });
    }
  }

  localStorage.setItem(LS.CLIENTS, JSON.stringify(clientsDB));
}

/* ===================== DISCOUNT APPLY (REMIND + APPLY) ===================== */
function applyClientDiscountToEntry(entryId, clientKey) {
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx < 0) return;

  const c = clientsDB.clients[clientKey];
  if (!c || !c.selectedDiscount) {
    toastCard({ title: "No discount selected", sub: c ? c.name : "Client", icon: "⚠️", tone: "red" });
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

  toastCard({
    title: "Discount applied",
    sub: entries[idx].client,
    mini: c.selectedDiscount.label,
    icon: "✅",
    tone: "green"
  });
}

/* ===================== SAVE ===================== */
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
function renderClientMiniBadges(clientName) {
  const key = clientKeyFromName(clientName);
  const c = clientsDB.clients[key];
  if (!c) return "";
  if (!c.levelName) return "";
  return `<span class="client-badge">${c.levelPng ? `<img src="${c.levelPng}" alt="">` : ""}${escapeHtml(c.levelName)}</span>`;
}

function renderBookedDiscountHint(entry) {
  const status = (entry.status || "").toLowerCase();
  if (status !== "booked") return "";

  const key = clientKeyFromName(entry.client);
  const c = clientsDB.clients[key];
  if (!c) return "";

  if ((c.eligibleDiscountIds || []).length && c.selectedDiscount && !entry.appliedDiscount) {
    return `
      <div class="sub-row" style="margin-top:8px;">
        <span class="pill gold">Eligible: ${escapeHtml(c.selectedDiscount.label)}</span>
        <button type="button" class="topBtn" style="padding:6px 10px; border-radius:12px; margin-left:8px;"
          data-applydisc="${entry.id}">
          Apply
        </button>
      </div>
    `;
  }
  return "";
}

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

/* ===================== ENTRY FORM / VIEW ===================== */
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
    payments: [],
    appliedDiscount: null
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

  if (!existingEntry && prefillClient) {
    if ($("client")) $("client").value = prefillClient.client || "";
    if ($("contact")) $("contact").value = prefillClient.contact || "";
    if ($("social")) $("social").value = prefillClient.social || "";
    prefillClient = null;
  }

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
      entries[idx].editHistory.push({ at: nowIso, kind: "edit", summary: changes.join(" • ") });
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
  rebuildClientsDBAndNotify();
  render();
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

  $("btnEditEntry").addEventListener("click", () => { closeView(); openForm(entry); });
  $("btnDeleteEntry").addEventListener("click", () => deleteEntry(id));
  $("btnCloseView").addEventListener("click", closeView);

  if (eligible) {
    $("btnApplyDiscount").addEventListener("click", () => applyClientDiscountToEntry(entry.id, ck));
    $("btnOpenClient").addEventListener("click", () => openClientProfile(entry.client));
  }

  showModal("viewModal");
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

/* ===================== CLIENT PROFILE ===================== */
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
        Eligible discounts auto-update. Picking one makes it the default reminder for booked appointments.
      </div>
      <div class="actions-row" style="margin-top:10px;">
        <button type="button" id="btnSaveClientDiscount">Save</button>
      </div>
    </div>

    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseClient">Close</button>
    </div>
  `;

  $("btnCloseClient").addEventListener("click", closeClient);

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

    toastCard({
      title: "Client updated",
      sub: name,
      mini: chosen ? `Discount set: ${discountLabel(rule)}` : "Discount cleared",
      icon: "👤",
      tone: "blue"
    });

    closeClient();
    rebuildClientsDBAndNotify();
    render();
  });

  showModal("clientModal");
}
function closeClient() { hideModal("clientModal"); }

/* ===================== APPOINTMENTS ===================== */
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

  box.querySelectorAll(".appt-card").forEach(card => {
    card.addEventListener("click", (ev) => {
      if (ev.target && ev.target.matches("[data-appt-apply]")) return;
      const id = Number(card.getAttribute("data-id"));
      closeAppointments();
      viewEntry(id);
    });
  });

  box.querySelectorAll("[data-appt-apply]").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const entryId = Number(btn.getAttribute("data-appt-apply"));
      const entry = entries.find(x => x.id === entryId);
      if (!entry) return;
      const ck = clientKeyFromName(entry.client);
      applyClientDiscountToEntry(entryId, ck);
      closeAppointments();
      openAppointments();
    });
  });

  $("btnCloseAppts").addEventListener("click", closeAppointments);

  showModal("appointmentsModal");
}
function closeAppointments(){ hideModal("appointmentsModal"); }

/* ===================== DISCOUNT BUILDER UI (STUDIO) ===================== */
function openStudio() {
  const box = $("studioBox");
  if (!box) return;

  box.innerHTML = `
    <div class="modal-title">Studio</div>

    <div class="summary-box">
      <div style="font-weight:900;color:var(--gold,#d4af37);">Payout Split</div>
      <div class="row">
        <input id="defaultSplitPct" type="number" value="${clampPct(splitSettings.defaultPct)}" placeholder="Default %">
        <button type="button" id="btnSaveSplit">Save</button>
      </div>
      <div class="hint">This affects totals display (your shop %).</div>
    </div>

    <div class="summary-box" style="margin-top:12px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="font-weight:900;color:var(--gold,#d4af37);">Discount Builder</div>
        <button type="button" id="btnAddDiscount" class="topBtn" style="padding:10px 12px;">+ Add</button>
      </div>
      <div class="hint" style="margin-top:8px;">
        Discounts unlock automatically by tattoo count / spend. Type can be Percent, Static, or Free.
      </div>

      <div id="discountList" style="margin-top:12px;"></div>

      <div class="actions-row" style="margin-top:12px;">
        <button type="button" id="btnSaveDiscounts">Save Discounts</button>
        <button type="button" class="secondarybtn" id="btnCloseStudio">Close</button>
      </div>
    </div>
  `;

  // split save
  $("btnSaveSplit").addEventListener("click", () => {
    splitSettings.defaultPct = clampPct($("defaultSplitPct")?.value || 100);
    localStorage.setItem(LS.SPLIT, JSON.stringify(splitSettings));
    toastCard({ title: "Studio saved", sub: "Split updated", mini: `${splitSettings.defaultPct}%`, icon: "🏦", tone: "blue" });
    rebuildClientsDBAndNotify();
    render();
  });

  $("btnCloseStudio").addEventListener("click", closeStudio);

  // discounts UI
  renderDiscountBuilder();
  $("btnAddDiscount").addEventListener("click", () => {
    rewardsSettings.discounts ||= [];
    rewardsSettings.discounts.push({
      id: "d_" + Date.now(),
      label: "New discount",
      minCount: 0,
      minSpend: 0,
      type: "percent",
      value: 10
    });
    renderDiscountBuilder();
  });

  $("btnSaveDiscounts").addEventListener("click", saveDiscountBuilder);

  showModal("studioModal");
}

function closeStudio(){ hideModal("studioModal"); }

function renderDiscountBuilder() {
  const root = $("discountList");
  if (!root) return;

  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];
  root.innerHTML = "";

  if (!rules.length) {
    root.innerHTML = `<div style="opacity:.75; margin-top:10px;">No discounts yet. Tap “+ Add”.</div>`;
    return;
  }

  rules.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "summary-box";
    card.style.marginTop = "10px";
    card.style.borderColor = "rgba(212,175,55,.14)";
    card.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <div style="font-weight:900;">${escapeHtml(r.label || "Discount")}</div>
        <button type="button" class="dangerbtn" data-del-discount="${r.id}" style="padding:8px 10px;">Delete</button>
      </div>

      <div class="row" style="margin-top:10px;">
        <input data-disc-field="label" data-disc-id="${r.id}" value="${escapeHtml(r.label || "")}" placeholder="Label (ex: 10% off)">
        <select data-disc-field="type" data-disc-id="${r.id}">
          <option value="percent" ${r.type === "percent" ? "selected" : ""}>Percent</option>
          <option value="static"  ${r.type === "static"  ? "selected" : ""}>Static</option>
          <option value="free"    ${r.type === "free"    ? "selected" : ""}>Free</option>
        </select>
      </div>

      <div class="row">
        <input data-disc-field="minCount" data-disc-id="${r.id}" type="number" value="${Number(r.minCount || 0)}" placeholder="Min tattoos">
        <input data-disc-field="minSpend" data-disc-id="${r.id}" type="number" value="${Number(r.minSpend || 0)}" placeholder="Min spend ($)">
      </div>

      <div class="row">
        <input data-disc-field="value" data-disc-id="${r.id}" type="number" value="${Number(r.value || 0)}" placeholder="Value">
        <div style="width:100%; display:flex; align-items:center; opacity:.8;">
          <span style="font-weight:800;">Value meaning:</span>
          <span style="margin-left:8px;">
            Percent = % off • Static = $ off • Free = ignored
          </span>
        </div>
      </div>
    `;
    root.appendChild(card);
  });

  // delete handlers
  root.querySelectorAll("[data-del-discount]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-discount");
      rewardsSettings.discounts = (rewardsSettings.discounts || []).filter(x => x.id !== id);
      renderDiscountBuilder();
    });
  });

  // live label update (so the card title updates as you type)
  root.querySelectorAll('input[data-disc-field="label"]').forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-disc-id");
      const rule = (rewardsSettings.discounts || []).find(x => x.id === id);
      if (rule) rule.label = inp.value;
      // quick rerender to update title text
      renderDiscountBuilder();
    }, { once: true });
  });
}

function saveDiscountBuilder() {
  const root = $("discountList");
  if (!root) return;

  const rules = Array.isArray(rewardsSettings.discounts) ? rewardsSettings.discounts : [];

  // read all fields
  const fields = root.querySelectorAll("[data-disc-field]");
  fields.forEach(el => {
    const id = el.getAttribute("data-disc-id");
    const field = el.getAttribute("data-disc-field");
    const rule = rules.find(x => x.id === id);
    if (!rule) return;

    let val = el.value;
    if (field === "minCount" || field === "minSpend" || field === "value") {
      val = Number(val || 0);
    }
    rule[field] = val;
  });

  // normalize types
  rules.forEach(r => {
    r.type = (r.type || "percent");
    if (r.type === "free") r.value = 0;
    if (!r.id) r.id = "d_" + Date.now();
    if (!r.label) r.label = discountLabel(r);
    r.minCount = Number(r.minCount || 0);
    r.minSpend = Number(r.minSpend || 0);
    r.value = Number(r.value || 0);
  });

  rewardsSettings.discounts = rules;
  localStorage.setItem(LS.REWARDS, JSON.stringify(rewardsSettings));

  toastCard({ title: "Discounts saved", sub: `${rules.length} discount(s)`, icon: "💾", tone: "gold" });

  // re-run automation so eligibilities update instantly
  rebuildClientsDBAndNotify();
  render();
}

/* ===================== EXPORT (stub stays) ===================== */
function openExport() {
  const box = $("exportBox");
  if (!box) return;
  box.innerHTML = `
    <div class="modal-title">Export</div>
    <div class="summary-box">
      <div style="opacity:.85;">Export suite polish is next (CSV + pay period + next/prev + summary).</div>
    </div>
    <div class="actions-row" style="margin-top:14px;">
      <button type="button" class="secondarybtn" id="btnCloseExport">Close</button>
    </div>
  `;
  $("btnCloseExport").addEventListener("click", closeExport);
  showModal("exportModal");
}
function closeExport(){ hideModal("exportModal"); }

/* ===================== FAB WIRING ===================== */
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

/* ===================== GLOBAL DELEGATES ===================== */
function bindGlobalDelegates() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;

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