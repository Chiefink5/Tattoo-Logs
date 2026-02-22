(function(){
  const InkBills = {};
  window.InkBills = InkBills;

  const STORAGE_KEY = "billsState_v1";

  function getEl(id){ return document.getElementById(id); }
  function num(v){ const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }

  function today0(){
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function parseDate(str){
    if(!str) return null;
    const d = new Date(str);
    if(Number.isNaN(d.getTime())) return null;
    d.setHours(0,0,0,0);
    return d;
  }

  function fmtMoney(n){
    const v = num(n);
    return "$" + v.toFixed(2).replace(/\.00$/,"");
  }

  function daysBetweenInclusive(start, end){
    const ms = end.getTime() - start.getTime();
    const days = Math.ceil(ms / (1000*60*60*24));
    return Math.max(1, days);
  }

  function roundUpNearest10(n){
    const v = num(n);
    if(v <= 0) return 0;
    return Math.ceil(v / 10) * 10;
  }

  function uid(){ return "bill_" + Date.now() + "_" + Math.random().toString(16).slice(2); }

  const quotes = [
    "The grind doesn’t stop. Why should you?",
    "Stack it now so you don’t stress later.",
    "Rent don’t care about excuses. Get it handled.",
    "Bread first. Everything else after.",
    "Discipline today = freedom tomorrow.",
    "You’re not broke. You’re building. Keep going.",
    "Every day you save is a day you win.",
    "Move like rent is watching — because it is.",
    "No panic later if you stack now.",
    "Handle business. Then flex."
  ];

  function pickQuote(){
    const idx = Math.floor((Date.now() / 1000) % quotes.length);
    return quotes[idx];
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { rentAmount:0, rentSaved:0, rentSafeByDay:15, bills:[] };

      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== "object") throw new Error("bad");

      if(!Array.isArray(parsed.bills)) parsed.bills = [];
      parsed.rentAmount = num(parsed.rentAmount);
      parsed.rentSaved = num(parsed.rentSaved);

      parsed.rentSafeByDay = Math.max(1, Math.min(28, Math.floor(num(parsed.rentSafeByDay || 15)) || 15));

      parsed.bills = parsed.bills.map(b=>({
        id: String(b.id || uid()),
        name: String(b.name || "Bill"),
        amount: num(b.amount),
        saved: num(b.saved),
        dueDate: String(b.dueDate || "")
      }));

      return parsed;
    }catch(e){
      return { rentAmount:0, rentSaved:0, rentSafeByDay:15, bills:[] };
    }
  }

  let state = loadState();

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getRentTargetDate(){
    const t = today0();
    const day = Math.max(1, Math.min(28, Math.floor(num(state.rentSafeByDay || 15)) || 15));

    const thisMonthTarget = new Date(t.getFullYear(), t.getMonth(), day);
    thisMonthTarget.setHours(0,0,0,0);

    if(t <= thisMonthTarget) return thisMonthTarget;

    const nextMonthTarget = new Date(t.getFullYear(), t.getMonth() + 1, day);
    nextMonthTarget.setHours(0,0,0,0);
    return nextMonthTarget;
  }

  function calcDailyTarget(){
    const t = today0();
    let sumDaily = 0;

    const rentRemaining = Math.max(0, num(state.rentAmount) - num(state.rentSaved));
    if(rentRemaining > 0){
      const target = getRentTargetDate();
      if(target > t){
        const days = daysBetweenInclusive(t, target);
        sumDaily += (rentRemaining / days);
      }
    }

    for(const b of state.bills){
      const remaining = Math.max(0, num(b.amount) - num(b.saved));
      if(!(remaining > 0)) continue;

      const due = parseDate(b.dueDate);
      if(!due) continue;
      if(due <= t) continue;

      const days = daysBetweenInclusive(t, due);
      sumDaily += (remaining / days);
    }

    return sumDaily;
  }

  function renderBillsList(){
    const list = getEl("billsList");
    if(!list) return;

    list.innerHTML = state.bills.map(b=>{
      const nameSafe = (b.name || "").replace(/"/g,"&quot;");
      return `
        <div class="summary-box" style="margin-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="font-weight:900;color:var(--gold);">${nameSafe || "Bill"}</div>
            <button type="button" class="secondarybtn" onclick="InkBills.removeBill('${b.id}')">Remove</button>
          </div>

          <div class="row">
            <div class="field">
              <label>Bill Name</label>
              <input type="text" value="${nameSafe}" oninput="InkBills.updateBill('${b.id}','name',this.value)">
            </div>
            <div class="field">
              <label>Amount</label>
              <input type="number" min="0" step="0.01" value="${num(b.amount)}" oninput="InkBills.updateBill('${b.id}','amount',this.value)">
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label>Saved So Far</label>
              <input type="number" min="0" step="0.01" value="${num(b.saved)}" oninput="InkBills.updateBill('${b.id}','saved',this.value)">
            </div>
            <div class="field">
              <label>Due Date</label>
              <input type="date" value="${b.dueDate || ""}" oninput="InkBills.updateBill('${b.id}','dueDate',this.value)">
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderTarget(){
    const out = getEl("billsTodayOut");
    const quoteEl = getEl("billsQuote");
    if(!out || !quoteEl) return;

    const daily = calcDailyTarget();
    const rounded = roundUpNearest10(daily);

    out.innerHTML = `
      <div style="font-size:18px;">
        Save at least:
        <span style="font-weight:1000;color:var(--gold);font-size:22px;">${fmtMoney(rounded)}</span>
      </div>
    `;

    quoteEl.textContent = pickQuote();
  }

  function hydrateUI(){
    const rentAmount = getEl("rentAmount");
    const rentSaved = getEl("rentSavedSoFar");
    const safeBy = getEl("rentSafeByDay");

    if(rentAmount) rentAmount.value = state.rentAmount ? String(state.rentAmount) : "";
    if(rentSaved) rentSaved.value = state.rentSaved ? String(state.rentSaved) : "";
    if(safeBy) safeBy.value = String(state.rentSafeByDay || 15);

    renderBillsList();
    renderTarget();
  }

  InkBills.openBills = function(){
    const modal = getEl("billsModal");
    if(!modal) return;
    hydrateUI();
    modal.style.display = "flex";
    renderTarget();
  };

  InkBills.closeBills = function(){
    const modal = getEl("billsModal");
    if(!modal) return;
    modal.style.display = "none";
  };

  InkBills.saveBills = function(){
    const rentAmount = getEl("rentAmount");
    const rentSaved = getEl("rentSavedSoFar");
    const safeBy = getEl("rentSafeByDay");

    state.rentAmount = num(rentAmount ? rentAmount.value : 0);
    state.rentSaved = num(rentSaved ? rentSaved.value : 0);

    const day = Math.max(1, Math.min(28, Math.floor(num(safeBy ? safeBy.value : 15)) || 15));
    state.rentSafeByDay = day;

    saveState();
    renderTarget();
  };

  InkBills.addBill = function(){
    state.bills.push({ id: uid(), name:"New Bill", amount:0, saved:0, dueDate:"" });
    saveState();
    renderBillsList();
    renderTarget();
  };

  InkBills.removeBill = function(id){
    state.bills = state.bills.filter(b=>b.id !== id);
    saveState();
    renderBillsList();
    renderTarget();
  };

  InkBills.updateBill = function(id, field, value){
    const b = state.bills.find(x=>x.id === id);
    if(!b) return;

    if(field === "amount" || field === "saved"){
      b[field] = num(value);
    } else {
      b[field] = String(value || "");
    }

    saveState();
    renderTarget();
  };

  (function wire(){
    const modal = getEl("billsModal");
    const box = getEl("billsBox");
    if(modal && box){
      modal.addEventListener("click",(e)=>{ if(e.target === modal) InkBills.closeBills(); });
      box.addEventListener("click",(e)=> e.stopPropagation());
    }
  })();

  window.openBills = function(){
    if(window.InkBills && typeof window.InkBills.openBills === "function"){
      window.InkBills.openBills();
      return;
    }
  };

  window.closeBills = function(){
    if(window.InkBills && typeof window.InkBills.closeBills === "function"){
      window.InkBills.closeBills();
      return;
    }
  };

  window.saveBills = function(){
    if(window.InkBills && typeof window.InkBills.saveBills === "function"){
      window.InkBills.saveBills();
      return;
    }
  };

  window.addBill = function(){
    if(window.InkBills && typeof window.InkBills.addBill === "function"){
      window.InkBills.addBill();
      return;
    }
  };
})();