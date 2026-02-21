// ================= BILLS STATE =================

let billsState = JSON.parse(localStorage.getItem("billsState") || "null") || {
  rentAmount: 0,
  rentSaved: 0,
  bills: [] // { id, name, amount, saved, dueDate }
};

function saveBillsState(){
  localStorage.setItem("billsState", JSON.stringify(billsState));
}

// ================= MODAL =================

const billsModal = document.getElementById("billsModal");
const billsBox = document.getElementById("billsBox");

function openBills(){
  if(!billsModal) return;
  hydrateBillsUI();
  calculateBillsTargets();
  billsModal.style.display = "flex";
}

function closeBills(){
  if(!billsModal) return;
  billsModal.style.display = "none";
}

window.openBills = openBills;
window.closeBills = closeBills;

// Click-off close
if(billsModal && billsBox){
  billsModal.addEventListener("click", (e)=>{
    if(e.target === billsModal) closeBills();
  });
  billsBox.addEventListener("click",(e)=> e.stopPropagation());
}

// ================= UTIL =================

function todayDate(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function parseDate(str){
  if(!str) return null;
  const d = new Date(str);
  d.setHours(0,0,0,0);
  return d;
}

function daysBetween(a,b){
  return Math.max(1, Math.ceil((b - a) / (1000*60*60*24)));
}

function roundUp10(n){
  if(n <= 0) return 0;
  return Math.ceil(n / 10) * 10;
}

function money(n){
  const v = Number(n || 0);
  return "$" + v.toFixed(2).replace(/\.00$/,"");
}

// ================= UI HYDRATION =================

function hydrateBillsUI(){
  const rentAmountEl = document.getElementById("rentAmount");
  const rentSavedEl = document.getElementById("rentSavedSoFar");
  const billsList = document.getElementById("billsList");

  if(rentAmountEl) rentAmountEl.value = billsState.rentAmount || "";
  if(rentSavedEl) rentSavedEl.value = billsState.rentSaved || "";

  if(!billsList) return;

  billsList.innerHTML = billsState.bills.map(b=>{
    return `
      <div class="summary-box" data-id="${b.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${b.name}</strong>
          <button type="button" class="secondarybtn" onclick="removeBill('${b.id}')">Remove</button>
        </div>
        <div class="row">
          <input type="text" value="${b.name}" onchange="updateBillField('${b.id}','name',this.value)">
          <input type="number" value="${b.amount}" onchange="updateBillField('${b.id}','amount',this.value)">
        </div>
        <div class="row">
          <input type="number" placeholder="Saved so far" value="${b.saved || 0}" onchange="updateBillField('${b.id}','saved',this.value)">
          <input type="date" value="${b.dueDate || ""}" onchange="updateBillField('${b.id}','dueDate',this.value)">
        </div>
      </div>
    `;
  }).join("");
}

// ================= BILL CRUD =================

function addBill(){
  billsState.bills.push({
    id: "bill_" + Date.now(),
    name: "New Bill",
    amount: 0,
    saved: 0,
    dueDate: ""
  });
  saveBillsState();
  hydrateBillsUI();
}

function removeBill(id){
  billsState.bills = billsState.bills.filter(b=>b.id !== id);
  saveBillsState();
  hydrateBillsUI();
  calculateBillsTargets();
}

function updateBillField(id, field, value){
  const bill = billsState.bills.find(b=>b.id === id);
  if(!bill) return;

  if(field === "amount" || field === "saved"){
    bill[field] = Number(value || 0);
  } else {
    bill[field] = value;
  }

  saveBillsState();
  calculateBillsTargets();
}

window.addBill = addBill;
window.removeBill = removeBill;
window.updateBillField = updateBillField;

// ================= SAVE =================

function saveBills(){
  const rentAmountEl = document.getElementById("rentAmount");
  const rentSavedEl = document.getElementById("rentSavedSoFar");

  billsState.rentAmount = Number(rentAmountEl?.value || 0);
  billsState.rentSaved = Number(rentSavedEl?.value || 0);

  saveBillsState();
  calculateBillsTargets();
}

window.saveBills = saveBills;

// ================= CALC ENGINE =================

function calculateBillsTargets(){
  const output = document.getElementById("billsTodayOut");
  const quoteEl = document.getElementById("billsQuote");
  if(!output) return;

  const today = todayDate();
  let totalTodayRequired = 0;

  // RENT (due 1st next occurrence)
  const rentRemaining = Math.max(0, billsState.rentAmount - billsState.rentSaved);

  if(rentRemaining > 0){
    const nextRent = new Date(today.getFullYear(), today.getMonth()+1, 1);
    const days = daysBetween(today, nextRent);
    totalTodayRequired += rentRemaining / days;
  }

  // BILLS
  billsState.bills.forEach(b=>{
    const remaining = Math.max(0, Number(b.amount||0) - Number(b.saved||0));
    const due = parseDate(b.dueDate);

    if(remaining > 0 && due && due > today){
      const days = daysBetween(today, due);
      totalTodayRequired += remaining / days;
    }
  });

  const rounded = roundUp10(totalTodayRequired);

  output.innerHTML = `
    <div style="font-size:18px;">
      Save at least: <strong style="color:var(--gold);font-size:22px;">${money(rounded)}</strong>
    </div>
  `;

  renderGrindQuote();
}

// ================= GRIND QUOTES =================

const grindQuotes = [
  "The grind doesn’t stop. Why should you?",
  "You didn’t come this far to coast.",
  "Every dollar stacked is stress removed.",
  "Discipline today = freedom tomorrow.",
  "Build the life your younger self needed.",
  "Stack now. Relax later.",
  "Pressure makes diamonds.",
  "Rent doesn’t care about excuses.",
  "Hustle in silence. Pay in full.",
  "Bread first. Everything else after."
];

function renderGrindQuote(){
  const quoteEl = document.getElementById("billsQuote");
  if(!quoteEl) return;

  const index = new Date().getDate() % grindQuotes.length;
  quoteEl.textContent = grindQuotes[index];
}