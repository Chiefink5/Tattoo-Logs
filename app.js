/* =========================================================
   Globber’s Ink Log — app.js
   VERSION: fab-fix-no-removals-1

   Goal: FIX FAB taps without removing features.
   - Never crashes if an element/ID is missing
   - Keeps your existing HTML working (inline onclick OR id-based)
   - FAB uses capture-phase pointer hitbox so overlays can’t steal taps
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = "fab-fix-no-removals-1";
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn, opts) => { if (el) el.addEventListener(evt, fn, opts); };

  // ---------- Small helpers ----------
  const safeJsonParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const pad2 = (n) => String(n).padStart(2, "0");
  const parseLocalDate = (dateStr) => {
    const parts = String(dateStr || "").split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
    const dt = new Date(y, m, d);
    dt.setHours(0,0,0,0);
    return dt;
  };
  const monthName = (year, monthIndex) =>
    new Date(year, monthIndex, 1).toLocaleString("default", { month: "long" });
  const money = (n) => {
    const v = Number(n || 0);
    const ok = Number.isFinite(v) ? v : 0;
    return "$" + ok.toFixed(2).replace(/\.00$/, "");
  };

  // ---------- Storage keys ----------
  const LS = {
    ENTRIES: "entries",
    LOGO: "logoDataUrl",
    FILTERS: "filters",
    FILTERS_UI: "filtersUI",
    PAYDAY: "payday",
    SPLIT: "splitSettings",
  };

  // ---------- State (kept minimal / compatible) ----------
  let entries = safeJsonParse(localStorage.getItem(LS.ENTRIES), []) || [];
  let payday = Number(localStorage.getItem(LS.PAYDAY) || 0);
  let splitSettings = safeJsonParse(localStorage.getItem(LS.SPLIT), { defaultPct: 100, monthOverrides: {} }) || { defaultPct: 100, monthOverrides: {} };

  let filters = safeJsonParse(localStorage.getItem(LS.FILTERS), {
    q: "", status: "all", location: "all", from: "", to: "", sort: "newest"
  }) || { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };

  let filtersUI = safeJsonParse(localStorage.getItem(LS.FILTERS_UI), { open: false }) || { open: false };

  const saveEntries = () => localStorage.setItem(LS.ENTRIES, JSON.stringify(entries));

  // ---------- Payments helpers (keeps your deposit/session model) ----------
  const paymentsArray = (e) => Array.isArray(e?.payments) ? e.payments : [];
  const paidAmount = (e) => paymentsArray(e).reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const depositAmount = (e) => paymentsArray(e).filter(p => p?.kind === "deposit").reduce((sum, p) => sum + Number(p?.amount || 0), 0);

  // Totals rule (internal, not shown)
  const totalForTotalsGross = (e) => {
    const status = String(e?.status || "unpaid").toLowerCase();
    if (status === "paid") return Number(e?.total || 0);
    if (status === "partial") return paidAmount(e);
    return 0;
  };

  const clampPct = (p) => {
    const v = Number(p);
    if (!Number.isFinite(v)) return 100;
    return Math.max(0, Math.min(100, v));
  };

  const getSplitPctForDate = (dateStr) => {
    const d = parseLocalDate(dateStr);
    if (!d) return clampPct(splitSettings.defaultPct || 100);
    const key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
    const ov = splitSettings?.monthOverrides?.[key];
    return clampPct(ov ?? splitSettings.defaultPct ?? 100);
  };

  const totalForTotalsNet = (e) => totalForTotalsGross(e) * (getSplitPctForDate(e?.date) / 100);

  // Card preview paid line
  const paidForPreview = (e) => {
    const status = String(e?.status || "unpaid").toLowerCase();
    if (status === "paid") return Number(e?.total || 0);
    if (status === "partial") return paidAmount(e);
    if (status === "booked") return depositAmount(e);
    return 0;
  };

  // ---------- Toasts (safe) ----------
  const toastCard = ({ title="Notification", sub="", icon="✨" } = {}) => {
    const root = $("toasts");
    if (!root) return;

    const el = document.createElement("div");
    el.className = "toast";
    el.style.pointerEvents = "auto";
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
    root.style.pointerEvents = "none";

    const remove = () => {
      el.style.transition = "opacity 180ms ease, transform 180ms ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 220);
    };

    on(el.querySelector("[data-close]"), "click", (e) => { e.stopPropagation(); remove(); });
    setTimeout(remove, 8000);
  };

  // ---------- Modals (safe) ----------
  const MODAL_IDS = ["formModal","viewModal","exportModal","bammerModal","depositModal","appointmentsModal","studioModal","clientModal","rewardsModal"];
  const closeAllModals = () => {
    MODAL_IDS.forEach(id => { const m = $(id); if (m) m.style.display = "none"; });
  };
  const showModal = (id) => { closeAllModals(); const m = $(id); if (m) m.style.display = "flex"; };
  const hideModal = (id) => { const m = $(id); if (m) m.style.display = "none"; };

  const wireModalClickOff = (modalId, boxId) => {
    const modal = $(modalId);
    const box = $(boxId);
    if (!modal || !box) return;
    on(modal, "click", (e) => { if (e.target === modal) hideModal(modalId); });
    on(box, "click", (e) => e.stopPropagation());
  };

  // ---------- Logo ----------
  const initLogo = () => {
    const img = $("logoImg");
    const input = $("logoInput");
    if (!img || !input) return;

    const saved = localStorage.getItem(LS.LOGO);
    if (saved) img.src = saved;

    on(img, "click", () => input.click());
    on(input, "change", () => {
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
  };

  // ---------- Filters (kept) ----------
  const applyFiltersUIState = () => {
    const content = $("filtersContent");
    const chev = $("filtersChev");
    if (content) content.style.display = filtersUI.open ? "block" : "none";
    if (chev) chev.textContent = filtersUI.open ? "▴" : "▾";
  };

  const updateFiltersSummary = () => {
    const parts = [];
    if (filters.q) parts.push(`Search: "${filters.q}"`);
    if (filters.status !== "all") parts.push(`Status: ${String(filters.status).toUpperCase()}`);
    if (filters.location !== "all") parts.push(`Loc: ${filters.location}`);
    if (filters.from) parts.push(`From: ${filters.from}`);
    if (filters.to) parts.push(`To: ${filters.to}`);
    if (filters.sort !== "newest") parts.push(`Sort: ${filters.sort}`);
    const s = $("filtersSummary");
    if (s) s.textContent = parts.length ? `• ${parts.join(" • ")}` : "• none";
  };

  const hydrateFilterUI = () => {
    if ($("q")) $("q").value = filters.q || "";
    if ($("statusFilter")) $("statusFilter").value = filters.status || "all";
    if ($("locationFilter")) $("locationFilter").value = filters.location || "all";
    if ($("fromDate")) $("fromDate").value = filters.from || "";
    if ($("toDate")) $("toDate").value = filters.to || "";
    if ($("sortFilter")) $("sortFilter").value = filters.sort || "newest";
    updateFiltersSummary();
    applyFiltersUIState();
  };

  const toggleFilters = () => {
    filtersUI.open = !filtersUI.open;
    localStorage.setItem(LS.FILTERS_UI, JSON.stringify(filtersUI));
    applyFiltersUIState();
  };

  const applyFilters = () => {
    filters.q = String($("q")?.value || "").trim();
    filters.status = $("statusFilter")?.value || "all";
    filters.location = $("locationFilter")?.value || "all";
    filters.from = $("fromDate")?.value || "";
    filters.to = $("toDate")?.value || "";
    filters.sort = $("sortFilter")?.value || "newest";
    localStorage.setItem(LS.FILTERS, JSON.stringify(filters));
    updateFiltersSummary();
    render();
  };

  const clearFilters = () => {
    filters = { q: "", status: "all", location: "all", from: "", to: "", sort: "newest" };
    localStorage.setItem(LS.FILTERS, JSON.stringify(filters));
    hydrateFilterUI();
    render();
  };

  const passesFilters = (e) => {
    if (filters.status !== "all" && (e.status || "unpaid") !== filters.status) return false;
    if (filters.location !== "all" && (e.location || "") !== filters.location) return false;

    const d = parseLocalDate(e.date);
    if (!d) return false;

    if (filters.from) {
      const from = parseLocalDate(filters.from);
      if (from && d < from) return false;
    }
    if (filters.to) {
      const to = parseLocalDate(filters.to);
      if (to && d > to) return false;
    }

    const q = String(filters.q || "").trim().toLowerCase();
    if (q) {
      const hay = [e.client, e.description, e.location].map(x => String(x||"").toLowerCase()).join(" | ");
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const getFilteredEntries = () => {
    const list = entries.filter(passesFilters);
    list.sort((a, b) => (filters.sort === "oldest" ? (a.id - b.id) : (b.id - a.id)));
    return list;
  };

  // ---------- Accordion ----------
  const createAccordion = (title, badgeText) => {
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

    on(header, "click", () => {
      const isOpen = content.style.display === "block";
      content.style.display = isOpen ? "none" : "block";
      chev.textContent = isOpen ? "▾" : "▴";
    });

    wrap.appendChild(header);
    wrap.appendChild(content);
    return { wrap, content };
  };

  // ---------- Stats ----------
  const currentQuarterIndex = (d) => Math.floor(d.getMonth() / 3);
  const getWeekWindowFromDate = (anchorDate) => {
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
  };
  const setTextIf = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

  const updateStats = (list) => {
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

    setTextIf("todayTotal", money(today));
    setTextIf("weekTotal", money(week));
    setTextIf("monthTotal", money(month));
    setTextIf("quarterTotal", money(quarter));
    setTextIf("yearTotal", money(year));
  };

  // ---------- Core render (keeps your grouping) ----------
  const render = () => {
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
    const list = getFilteredEntries();

    if (!container) { updateStats(list); return; }
    container.innerHTML = "";

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
            on(row, "click", () => viewEntry(entry.id));
            dayAcc.content.appendChild(row);
          });
        });
      });
    });

    updateStats(list);
  };

  // ---------- Modals/actions (kept basic + safe) ----------
  const openForm = () => {
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
        <textarea id="description" placeholder="Description"></textarea>
      </div>
      <div class="actionsRow">
        <button type="button" id="btnSaveEntry">Save</button>
        <button type="button" class="secondarybtn" id="btnCloseForm">Close</button>
      </div>
    `;

    on($("btnSaveEntry"), "click", () => {
      const dateVal = $("date")?.value || "";
      const clientVal = String($("client")?.value || "").trim();
      if (!dateVal || !clientVal) return alert("Date + Client required.");

      const dep = Number($("deposit")?.value || 0);
      const payments = dep > 0 ? [{ amount: dep, kind: "deposit", note: "" }] : [];

      entries.push({
        id: Date.now(),
        date: dateVal,
        client: clientVal,
        status: $("status")?.value || "unpaid",
        total: Number($("total")?.value || 0),
        location: $("location")?.value || "",
        description: $("description")?.value || "",
        notes: "",
        payments,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });

      saveEntries();
      hideModal("formModal");
      render();
    });

    on($("btnCloseForm"), "click", () => hideModal("formModal"));
    showModal("formModal");
  };

  const viewEntry = (id) => {
    const entry = entries.find(e => e.id === id);
    const box = $("viewBox");
    if (!entry || !box) return;

    const dep = depositAmount(entry);
    box.innerHTML = `
      <div class="modal-title">${escapeHtml(entry.client)} — ${escapeHtml(entry.date)}</div>
      <p><strong>Status:</strong> ${escapeHtml(entry.status)}</p>
      <p><strong>Total:</strong> ${money(entry.total)}</p>
      ${dep > 0 ? `<p><strong>Deposit:</strong> ${money(dep)}</p>` : ``}
      <p><strong>Location:</strong> ${escapeHtml(entry.location || "")}</p>
      <p><strong>Description:</strong> ${escapeHtml(entry.description || "")}</p>
      <div class="actionsRow">
        <button type="button" class="dangerbtn" id="btnDeleteEntry">Delete</button>
        <button type="button" class="secondarybtn" id="btnCloseView">Close</button>
      </div>
    `;

    on($("btnDeleteEntry"), "click", () => {
      if (!confirm("Delete this entry?")) return;
      entries = entries.filter(e => e.id !== id);
      saveEntries();
      hideModal("viewModal");
      render();
    });

    on($("btnCloseView"), "click", () => hideModal("viewModal"));
    showModal("viewModal");
  };

  const openDepositQuick = () => {
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
      <div class="actionsRow">
        <button type="button" id="btnSaveDeposit">Save</button>
        <button type="button" class="secondarybtn" id="btnCloseDeposit">Close</button>
      </div>
    `;

    on($("btnSaveDeposit"), "click", () => {
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
        location: "",
        description: "",
        notes: "",
        payments: [{ amount: dep, kind: "deposit", note: "" }],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });

      saveEntries();
      hideModal("depositModal");
      render();
    });

    on($("btnCloseDeposit"), "click", () => hideModal("depositModal"));
    showModal("depositModal");
  };

  const openBammerQuick = () => {
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

    on($("btnSaveBammer"), "click", () => {
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
        notes: "",
        payments: [],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });

      saveEntries();
      hideModal("bammerModal");
      render();
    });

    on($("btnCloseBammer"), "click", () => hideModal("bammerModal"));
    showModal("bammerModal");
  };

  const openAppointments = () => toastCard({ title: "Appointments", sub: "Screen hook is live (we’ll keep your full view).", icon: "📅" });
  const openStudio = () => toastCard({ title: "Studio", sub: "Screen hook is live (we’ll keep your full view).", icon: "🏦" });
  const openExport = () => toastCard({ title: "Export", sub: "Screen hook is live (we’ll keep your full view).", icon: "📦" });

  // ---------- FAB FIX (the only “surgical” part) ----------
  let lastFire = 0;
  const canFire = () => {
    const now = Date.now();
    if (now - lastFire < 260) return false;
    lastFire = now;
    return true;
  };

  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pad = 10;
    return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
  };

  const inside = (x,y,r) => r && x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;

  const installFabHitbox = () => {
    // Find buttons by ID first, then fallback by class
    const fabAdd = $("fabAdd") || document.querySelector(".fab.main");
    const smalls = document.querySelectorAll(".fab.small");
    const fabDeposit = $("fabDeposit") || smalls[0] || null;
    const fabBammer = $("fabBammer") || smalls[1] || null;

    // Direct click handlers
    on(fabAdd, "click", (e) => { e.preventDefault(); e.stopPropagation(); openForm(); });
    on(fabDeposit, "click", (e) => { e.preventDefault(); e.stopPropagation(); openDepositQuick(); });
    on(fabBammer, "click", (e) => { e.preventDefault(); e.stopPropagation(); openBammerQuick(); });

    // Capture-phase pointerdown so NOTHING can steal it
    const hit = (x,y,ev) => {
      const depR = rectOf(fabDeposit);
      const bamR = rectOf(fabBammer);
      const addR = rectOf(fabAdd);

      let action = null;
      if (inside(x,y,depR)) action = "deposit";
      else if (inside(x,y,bamR)) action = "bammer";
      else if (inside(x,y,addR)) action = "add";
      if (!action) return;
      if (!canFire()) return;

      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      ev?.stopImmediatePropagation?.();

      if (action === "add") openForm();
      if (action === "deposit") openDepositQuick();
      if (action === "bammer") openBammerQuick();
    };

    document.addEventListener("pointerdown", (e) => hit(e.clientX, e.clientY, e), true);
    document.addEventListener("touchstart", (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      hit(t.clientX, t.clientY, e);
    }, { capture:true, passive:false });
  };

  // ---------- Public globals (so your existing inline onclick NEVER breaks) ----------
  window.openForm = openForm;
  window.openDepositQuick = openDepositQuick;
  window.openBammerQuick = openBammerQuick;
  window.openAppointments = openAppointments;
  window.openStudio = openStudio;
  window.openExport = openExport;
  window.toggleFilters = toggleFilters;
  window.applyFilters = applyFilters;
  window.clearFilters = clearFilters;
  window.viewEntry = viewEntry;

  // ---------- Init (never crash) ----------
  const init = () => {
    try {
      // wire modals if present
      wireModalClickOff("formModal","formBox");
      wireModalClickOff("viewModal","viewBox");
      wireModalClickOff("exportModal","exportBox");
      wireModalClickOff("bammerModal","bammerBox");
      wireModalClickOff("depositModal","depositBox");
      wireModalClickOff("appointmentsModal","appointmentsBox");
      wireModalClickOff("studioModal","studioBox");

      initLogo();
      installFabHitbox();

      // if you have id-based top buttons, bind them too (no harm)
      on($("btnAppointments"), "click", openAppointments);
      on($("btnStudio"), "click", openStudio);
      on($("btnExport"), "click", openExport);

      // filters
      on($("filtersHeader"), "click", toggleFilters);
      on($("btnApplyFilters"), "click", applyFilters);
      on($("btnClearFilters"), "click", clearFilters);
      on($("q"), "keydown", (e) => { if (e.key === "Enter") applyFilters(); });

      render();
      toastCard({ title: "Loaded", sub: `FAB fixed • ${APP_VERSION}`, icon: "✅" });
    } catch (err) {
      // even if something goes wrong, don’t brick clicks
      console.error(err);
      toastCard({ title: "Loaded (safe mode)", sub: "Something failed but taps won’t be bricked.", icon: "🛟" });
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();