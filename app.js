/* =========================================================
   Globber’s Ink Log — app.js
   VERSION: 2026-02-20-1
   Purpose: make it impossible to “look unchanged”
   - On load: shows a toast "APP.JS LOADED v2026-02-20-1"
   - FAB clicks always work (capture-phase pointerdown)
   - Works even if main button is "+" OR a hamburger
   ========================================================= */

const APP_VERSION = "2026-02-20-1";

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

const DEFAULT_SPLIT = { defaultPct: 100, monthOverrides: {} };
const DEFAULT_FILTERS = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
const DEFAULT_FILTERS_UI = { open: false };
const DEFAULT_REWARDS = { levels: [], discounts: [] };

let entries = safeJsonParse(localStorage.getItem(LS.ENTRIES), []) || [];
let splitSettings = safeJsonParse(localStorage.getItem(LS.SPLIT), DEFAULT_SPLIT) || DEFAULT_SPLIT;
let rewardsSettings = safeJsonParse(localStorage.getItem(LS.REWARDS), DEFAULT_REWARDS) || DEFAULT_REWARDS;
let filters = safeJsonParse(localStorage.getItem(LS.FILTERS), DEFAULT_FILTERS) || DEFAULT_FILTERS;
let filtersUI = safeJsonParse(localStorage.getItem(LS.FILTERS_UI), DEFAULT_FILTERS_UI) || DEFAULT_FILTERS_UI;
let payday = Number(localStorage.getItem(LS.PAYDAY) || 0);

const $ = (id) => document.getElementById(id);
const normalize = (s) => String(s || "").trim().toLowerCase();
const pad2 = (n) => String(n).padStart(2, "0");

function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseLocalDate(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  const dt = new Date(y, m, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
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

function paymentsArray(entry) { return Array.isArray(entry.payments) ? entry.payments : []; }
function paidAmount(entry) { return paymentsArray(entry).reduce((sum, p) => sum + Number(p.amount || 0), 0); }
function depositAmount(entry) {
  return paymentsArray(entry).filter(p => p.kind === "deposit").reduce((sum, p) => sum + Number(p.amount || 0), 0);
}
function totalForTotalsGross(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  return 0;
}
function splitPctForDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return clampPct(splitSettings.defaultPct || 100);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const ov = splitSettings.monthOverrides?.[key];
  return clampPct(ov ?? splitSettings.defaultPct ?? 100);
}
function totalForTotalsNet(entry) {
  const gross = totalForTotalsGross(entry);
  return gross * (splitPctForDate(entry.date) / 100);
}
function paidForPreview(entry) {
  const status = (entry.status || "unpaid").toLowerCase();
  if (status === "paid") return Number(entry.total || 0);
  if (status === "partial") return paidAmount(entry);
  if (status === "booked") return depositAmount(entry);
  return 0;
}

/* ===================== TOASTS (card, 10s) ===================== */
const TOAST_MS = 10000;

function ensureToastPointerEvents() {
  const root = $("toasts");
  if (!root) return;
  root.style.pointerEvents = "none";
  root.querySelectorAll(".toast").forEach(t => (t.style.pointerEvents = "auto"));
}

function toastCard({ title="Notification", sub="", mini="", icon="✨" } = {}) {
  const root = $("toasts");
  if (!root) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.style.pointerEvents = "auto";
  el.style.position = "relative";
  el.style.overflow = "hidden";

  el.innerHTML = `
    <div style="display:flex; gap:12px; align-items:flex-start;">
      <div style="
        width:44px;height:44px;border-radius:14px;
        background: rgba(255,255,255,.06);
        border:1px solid rgba(212,175,55,.25);
        display:flex;align-items:center;justify-content:center; flex:0 0 44px;">
        <div style="font-size:20px; line-height:1;">${escapeHtml(icon)}</div>
      </div>

      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div style="font-weight:900; color:var(--gold,#d4af37);">${escapeHtml(title)}</div>
          <button type="button" data-toast-close style="
            border:1px solid rgba(255,255,255,.12);
            background: rgba(0,0,0,.18);
            color: rgba(255,255,255,.85);
            padding:6px 10px;border-radius:12px;font-weight:900;">✕</button>
        </div>

        ${sub ? `<div style="opacity:.93; margin-top:4px; word-wrap:break-word;">${escapeHtml(sub)}</div>` : ""}
        ${mini ? `<div style="opacity:.75; margin-top:6px; font-size:12px;">${escapeHtml(mini)}</div>` : ""}
      </div>
    </div>

    <div data-toast-bar style="
      position:absolute; left:0; bottom:0;
      height:3px; width:100%;
      background: rgba(212,175,55,.25);
      transform-origin:left; transform: scaleX(1);
    "></div>
  `;

  root.appendChild(el);
  ensureToastPointerEvents();

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

  closeBtn?.addEventListener("click", (e) => { e.stopPropagation(); remove(); });

  if (bar) {
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${TOAST_MS}ms linear`;
      bar.style.transform = "scaleX(0)";
    });
  }
  setTimeout(remove, TOAST_MS);
}

/* ===================== LOGO ===================== */
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

/* ===================== FILTERS ===================== */
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
  $("q") && ($("q").value = filters.q || "");
  $("statusFilter") && ($("statusFilter").value = filters.status || "all");
  $("locationFilter") && ($("locationFilter").value = filters.location || "all");
  $("fromDate") && ($("fromDate").value = filters.from || "");
  $("toDate") && ($("toDate").value = filters.to || "");
  $("sortFilter") && ($("sortFilter").value = filters.sort || "newest");
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
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += amt;
    if (d >= weekWin.start && d <= weekWin.end) week += amt;
  });

  todayEl.textContent = money(today);
  weekEl && (weekEl.textContent = money(week));
  monthEl && (monthEl.textContent = money(month));
  quarterEl && (quarterEl.textContent = money(quarter));
  yearEl && (yearEl.textContent = money(year));
}

/* ===================== RENDER (simple grouping) ===================== */
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

  if (badgeText != null) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = badgeText;
    left.appendChild(b);
  }

  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = "▾";

  const content = document.createElement("div");
  content.className = "accordion-content";

  header.appendChild(left);
  header.appendChild(chev);

  header.addEventListener("click", () => {
    const open = content.style.display === "block";
    content.style.display = open ? "none" : "block";
    chev.textContent = open ? "▾" : "▴";
  });

  wrap.appendChild(header);
  wrap.appendChild(content);
  return { wrap, content };
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
  if (!list.length) {
    container.innerHTML = "<p style='opacity:.65;'>No entries match your filters.</p>";
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

  Object.keys(grouped).sort((a, b) => Number(b) - Number(a)).forEach(year => {
    const yearAmt = Object.values(grouped[year]).flatMap(mo => Object.values(mo).flat())
      .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

    const yAcc = createAccordion(String(year), money(yearAmt));
    container.appendChild(yAcc.wrap);

    Object.keys(grouped[year]).sort((a, b) => Number(b) - Number(a)).forEach(monthIdx => {
      const monthAmt = Object.values(grouped[year][monthIdx]).flat()
        .reduce((sum, e) => sum + totalForTotalsNet(e), 0);

      const mAcc = createAccordion(monthName(Number(year), Number(monthIdx)), money(monthAmt));
      yAcc.content.appendChild(mAcc.wrap);

      Object.keys(grouped[year][monthIdx]).sort((a, b) => Number(b) - Number(a)).forEach(dayNum => {
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayAmt = dayEntries.reduce((sum, e) => sum + totalForTotalsNet(e), 0);

        const dateLabel = `${year}-${pad2(Number(monthIdx) + 1)}-${pad2(dayNum)}`;
        const dAcc = createAccordion(dateLabel, money(dayAmt));
        mAcc.content.appendChild(dAcc.wrap);

        dayEntries.forEach(entry => {
          const paidLine = money(paidForPreview(entry));
          const row2 = [entry.location, entry.description].filter(Boolean).join(" • ");

          const row = document.createElement("div");
          row.className = "entry";
          row.innerHTML = `
            <div class="entry-left">
              <div class="entry-name">${escapeHtml(entry.client)}</div>
              <div class="entry-sub">
                <div class="sub-row"><strong>Paid:</strong> ${paidLine}</div>
                <div class="sub-row clamp2">${escapeHtml(row2 || "")}</div>
              </div>
            </div>
            <div class="status ${escapeHtml(entry.status || "unpaid")}">${escapeHtml(entry.status || "unpaid")}</div>
          `;
          row.addEventListener("click", () => alert("View modal wired in your full build (this is the load/test build)."));
          dAcc.content.appendChild(row);
        });
      });
    });
  });

  updateStats(list);
}

/* ===================== FAB FIX (works even if + is hamburger) ===================== */
function hardenFabClickability() {
  ["fabAdd","fabDeposit","fabBammer"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.style.zIndex = "999999";
    el.style.pointerEvents = "auto";
    el.querySelectorAll("*").forEach(ch => (ch.style.pointerEvents = "none"));
  });
  ensureToastPointerEvents();
}

function detectFabAction(target) {
  const el =
    target?.closest?.("#fabAdd, #fabDeposit, #fabBammer") ||
    target?.closest?.(".fab.main, .fab.small");

  if (!el) return null;

  if (el.id === "fabDeposit") return "deposit";
  if (el.id === "fabBammer") return "bammer";

  // main button can be + OR hamburger (≡) or anything — treat it as Add
  if (el.id === "fabAdd" || el.classList.contains("main")) return "add";

  // fallback: first small=deposit, second small=bammer
  if (el.classList.contains("small")) {
    const smalls = Array.from(document.querySelectorAll(".fab.small"));
    const idx = smalls.indexOf(el);
    return idx === 0 ? "deposit" : "bammer";
  }
  return null;
}

function runFabAction(action) {
  if (action === "add") toastCard({ title: "FAB", sub: "Add tapped", mini: `v${APP_VERSION}`, icon: "➕" });
  if (action === "deposit") toastCard({ title: "FAB", sub: "Deposit tapped", mini: `v${APP_VERSION}`, icon: "💵" });
  if (action === "bammer") toastCard({ title: "FAB", sub: "Bammer tapped", mini: `v${APP_VERSION}`, icon: "💥" });
}

function installFabDelegation() {
  const handler = (e) => {
    const action = detectFabAction(e.target);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    runFabAction(action);
  };

  // capture-phase so overlays / weird layers can't eat taps
  document.addEventListener("pointerdown", handler, true);
  document.addEventListener("click", handler, true);
  document.addEventListener("touchend", handler, { capture: true, passive: false });
}

/* ===================== INIT ===================== */
function init() {
  initLogo();
  installFabDelegation();
  hardenFabClickability();
  setTimeout(hardenFabClickability, 250);
  setTimeout(hardenFabClickability, 900);

  toastCard({ title: "APP.JS LOADED", sub: "You are on the NEW build.", mini: `v${APP_VERSION}`, icon: "✅" });

  render();
}

document.addEventListener("DOMContentLoaded", init);

/* ===================== GLOBALS for HTML onclick ===================== */
window.toggleFilters = toggleFilters;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

window.openAppointments = () => toastCard({ title: "Open", sub: "Appointments", mini:`v${APP_VERSION}`, icon:"📅" });
window.openStudio = () => toastCard({ title: "Open", sub: "Studio", mini:`v${APP_VERSION}`, icon:"🏦" });
window.openExport = () => toastCard({ title: "Open", sub: "Export", mini:`v${APP_VERSION}`, icon:"📤" });

window.openForm = () => toastCard({ title: "Open", sub: "Add Entry", mini:`v${APP_VERSION}`, icon:"➕" });
window.openDepositQuick = () => toastCard({ title: "Open", sub: "Deposit", mini:`v${APP_VERSION}`, icon:"💵" });
window.openBammerQuick = () => toastCard({ title: "Open", sub: "Bammer", mini:`v${APP_VERSION}`, icon:"💥" });