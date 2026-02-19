let entries = JSON.parse(localStorage.getItem("entries") || "[]");

/* ---------- SAVE ---------- */
function save(){
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}

/* ---------- FORM ---------- */
function openForm(){
  document.getElementById("formModal").style.display="flex";
  document.getElementById("date").value =
  new Date().toISOString().split("T")[0];
}

function closeForm(){
  document.getElementById("formModal").style.display="none";
  document.getElementById("sessions").innerHTML="";
}

/* ---------- ADD SESSION ---------- */
function addSession(){
  const container=document.getElementById("sessions");
  const div=document.createElement("div");

  div.innerHTML=`
  <input type="number" class="session-amount" placeholder="Session Amount">
  `;

  container.appendChild(div);
}

/* ---------- STATUS ---------- */
function calculateStatus(entry){
  const paid = entry.payments.reduce((s,p)=>s+p.amount,0);
  if(paid===0) return "unpaid";
  if(paid < entry.total) return "partial";
  return "paid";
}

/* ---------- SAVE ENTRY ---------- */
function saveEntry(){

  const payments=[];

  const depositVal=Number(document.getElementById("deposit").value||0);
  if(depositVal>0){
    payments.push({amount:depositVal});
  }

  document.querySelectorAll(".session-amount").forEach(input=>{
    const val=Number(input.value||0);
    if(val>0){
      payments.push({amount:val});
    }
  });

  const entry={
    id:Date.now(),
    date:document.getElementById("date").value,
    client:document.getElementById("client").value || "Unnamed",
    total:Number(document.getElementById("total").value||0),
    payments:payments
  };

  entries.push(entry);
  save();
  closeForm();
}

/* ---------- ACCORDION ---------- */
function createAccordion(title){
  const wrapper=document.createElement("div");
  wrapper.className="accordion";

  wrapper.innerHTML=`
  <div class="accordion-header">${title}</div>
  <div class="accordion-content"></div>
  `;

  wrapper.querySelector(".accordion-header").onclick=function(){
    const content=wrapper.querySelector(".accordion-content");
    content.style.display =
    content.style.display==="block" ? "none" : "block";
  };

  return wrapper;
}

/* ---------- RENDER ---------- */
function render(){

  const container=document.getElementById("entries");
  container.innerHTML="";

  const grouped={};

  entries.forEach(e=>{
    const d=new Date(e.date);
    const y=d.getFullYear();
    const m=d.getMonth();
    const day=d.getDate();

    if(!grouped[y]) grouped[y]={};
    if(!grouped[y][m]) grouped[y][m]={};
    if(!grouped[y][m][day]) grouped[y][m][day]=[];

    grouped[y][m][day].push(e);
  });

  Object.keys(grouped).sort((a,b)=>b-a).forEach(year=>{
    const yearAcc=createAccordion(year);
    const yearContent=yearAcc.querySelector(".accordion-content");

    Object.keys(grouped[year]).sort((a,b)=>b-a).forEach(month=>{
      const monthName=new Date(year,month).toLocaleString("default",{month:"long"});
      const monthAcc=createAccordion(monthName);
      const monthContent=monthAcc.querySelector(".accordion-content");

      Object.keys(grouped[year][month]).sort((a,b)=>b-a).forEach(day=>{
        const dayAcc=createAccordion(`${year}-${Number(month)+1}-${day}`);
        const dayContent=dayAcc.querySelector(".accordion-content");

        grouped[year][month][day].forEach(e=>{
          const paid=e.payments.reduce((s,p)=>s+p.amount,0);
          const status=calculateStatus(e);

          const div=document.createElement("div");
          div.className="entry";

          div.innerHTML=`
            <span>${e.client} - $${paid}</span>
            <span class="status ${status}">${status}</span>
          `;

          dayContent.appendChild(div);
        });

        monthContent.appendChild(dayAcc);
      });

      yearContent.appendChild(monthAcc);
    });

    container.appendChild(yearAcc);
  });

  updateStats();
}

/* ---------- STATS ---------- */
function updateStats(){
  const now=new Date();
  let today=0,week=0,month=0,year=0;

  entries.forEach(e=>{
    const paid=e.payments.reduce((s,p)=>s+p.amount,0);
    const d=new Date(e.date);

    if(e.date===now.toISOString().split("T")[0]) today+=paid;
    if(d.getFullYear()===now.getFullYear()) year+=paid;
    if(d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()) month+=paid;
    if((now-d)/(1000*60*60*24)<=7) week+=paid;
  });

  document.getElementById("todayTotal").innerText="$"+today;
  document.getElementById("weekTotal").innerText="$"+week;
  document.getElementById("monthTotal").innerText="$"+month;
  document.getElementById("yearTotal").innerText="$"+year;
}

/* ---------- INIT ---------- */
render();