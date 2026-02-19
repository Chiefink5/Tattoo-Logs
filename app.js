// ================= STATE =================
let entries = JSON.parse(localStorage.getItem("entries") || "[]");

// ================= HELPERS =================
function money(n){ return "$" + (Number(n || 0)); }

function paidAmount(entry){
  return (entry.payments || []).reduce((sum,p)=>sum + Number(p.amount || 0), 0);
}

function safeVal(id){
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function monthName(year, monthIndex){
  return new Date(year, monthIndex, 1).toLocaleString("default",{month:"long"});
}

// ================= SAVE =================
function save(){
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}

// ================= MODALS (click off to close) =================
const formModal = document.getElementById("formModal");
const formBox = document.getElementById("formBox");
const viewModal = document.getElementById("viewModal");
const viewBox = document.getElementById("viewBox");

if (formModal){
  formModal.addEventListener("click", (e)=>{ if(e.target===formModal) closeForm(); });
}
if (viewModal){
  viewModal.addEventListener("click", (e)=>{ if(e.target===viewModal) closeView(); });
}
// Prevent clicks inside from closing (extra safe)
if (formBox){
  formBox.addEventListener("click", (e)=> e.stopPropagation());
}
if (viewBox){
  viewBox.addEventListener("click", (e)=> e.stopPropagation());
}

function openForm(){
  if (!formModal) return;
  formModal.style.display="flex";
  const dateEl = document.getElementById("date");
  if(dateEl) dateEl.value = new Date().toISOString().split("T")[0];
}

function resetForm(){
  const modal = document.getElementById("formModal");
  if(!modal) return;

  modal.querySelectorAll("input, textarea, select").forEach(el=>{
    if(el.type === "file") el.value = "";
    else el.value = "";
  });

  const sessions = document.getElementById("sessions");
  if(sessions) sessions.innerHTML="";
}

function closeForm(){
  if (!formModal) return;
  formModal.style.display="none";
  resetForm();
}

function closeView(){
  if(!viewModal) return;
  viewModal.style.display="none";
}

// ================= SESSIONS =================
function addSession(){
  const container = document.getElementById("sessions");
  if(!container) return;

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="number" class="session-amount" placeholder="Session Amount">
    <input type="text" class="session-note" placeholder="Session Note (optional)">
  `;
  container.appendChild(row);
}

// ================= ENTRY SAVE =================
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

  const entry = {
    id: Date.now(),
    date: dateVal,
    client: clientVal,
    contact: safeVal("contact"),
    social: safeVal("social"),
    description: safeVal("description"),
    location: safeVal("location"),
    notes: safeVal("notes"),
    total: Number(safeVal("total") || 0),
    payments,
    status: safeVal("status") || "unpaid",
    image: null
  };

  const imageEl = document.getElementById("image");
  const file = imageEl && imageEl.files ? imageEl.files[0] : null;

  const finalize = ()=>{
    entries.push(entry);
    save();
    closeForm();
  };

  if(file){
    const reader = new FileReader();
    reader.onload = (e)=>{
      entry.image = e.target.result;
      finalize();
    };
    reader.readAsDataURL(file);
  } else {
    finalize();
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

// ================= VIEW ENTRY =================
function viewEntry(id){
  const entry = entries.find(e=>e.id===id);
  if(!entry || !viewBox) return;

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

    <button type="button" onclick="closeView()">Close</button>
  `;

  if(viewModal) viewModal.style.display = "flex";
}

// ================= STATS =================
function updateStats(){
  const todayEl = document.getElementById("todayTotal");
  const weekEl = document.getElementById("weekTotal");
  const monthEl = document.getElementById("monthTotal");
  const yearEl = document.getElementById("yearTotal");
  if(!todayEl) return;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  let today=0, week=0, month=0, year=0;

  entries.forEach(entry=>{
    const paid = paidAmount(entry);
    const d = new Date(entry.date);

    if(entry.date === todayStr) today += paid;
    if(d.getFullYear() === now.getFullYear()) year += paid;
    if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) month += paid;

    // (still basic week: last 7 days; payday-aligned comes next)
    if((now - d) / (1000*60*60*24) <= 7) week += paid;
  });

  todayEl.innerText = money(today);
  if(weekEl) weekEl.innerText = money(week);
  if(monthEl) monthEl.innerText = money(month);
  if(yearEl) yearEl.innerText = money(year);
}

// ================= RENDER (Year → Month → Day → Entries) =================
function render(){
  const container = document.getElementById("entries");
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
    const d = new Date(e.date);
    const y = d.getFullYear();
    const m = d.getMonth();     // 0-11
    const day = d.getDate();    // 1-31

    if(!grouped[y]) grouped[y] = {};
    if(!grouped[y][m]) grouped[y][m] = {};
    if(!grouped[y][m][day]) grouped[y][m][day] = [];

    grouped[y][m][day].push(e);
  });

  // Render newest year first
  Object.keys(grouped).sort((a,b)=>Number(b)-Number(a)).forEach(year=>{
    // Year total badge
    const yearPaid = Object.values(grouped[year]).flatMap(mo=>Object.values(mo).flat()).reduce((sum,e)=>sum+paidAmount(e),0);
    const yearAcc = createAccordion(String(year), money(yearPaid));
    container.appendChild(yearAcc.wrap);

    // Months (newest first)
    Object.keys(grouped[year]).sort((a,b)=>Number(b)-Number(a)).forEach(monthIdx=>{
      const monthPaid = Object.values(grouped[year][monthIdx]).flat().reduce((sum,e)=>sum+paidAmount(e),0);
      const monthAcc = createAccordion(monthName(year, Number(monthIdx)), money(monthPaid));
      yearAcc.content.appendChild(monthAcc.wrap);

      // Days (newest first)
      Object.keys(grouped[year][monthIdx]).sort((a,b)=>Number(b)-Number(a)).forEach(dayNum=>{
        const dayEntries = grouped[year][monthIdx][dayNum];
        const dayPaid = dayEntries.reduce((sum,e)=>sum+paidAmount(e),0);

        const dateLabel = `${year}-${String(Number(monthIdx)+1).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
        const dayAcc = createAccordion(dateLabel, money(dayPaid));
        monthAcc.content.appendChild(dayAcc.wrap);

        // Entries inside the day
        dayEntries
          .slice()
          .sort((a,b)=>b.id - a.id) // newest first
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