let entries = JSON.parse(localStorage.getItem("entries") || "[]");

/* SAVE */
function save(){
localStorage.setItem("entries", JSON.stringify(entries));
render();
}

/* ACCORDION TOGGLE */
function toggleAccordion(element){
const content = element.nextElementSibling;
content.style.display = content.style.display === "block" ? "none" : "block";
}

/* FORM */
function openForm(){
formModal.style.display="flex";
date.value = new Date().toISOString().split("T")[0];
}

function closeForm(){
formModal.style.display="none";
sessions.innerHTML="";
}

/* ADD SESSION */
function addSessionField(){
const div = document.createElement("div");
div.innerHTML = `
<input type="date" class="session-date">
<input type="number" class="session-amount" placeholder="Session Amount">
`;
sessions.appendChild(div);
}

/* STATUS */
function calculateStatus(entry){
const paid = entry.payments.reduce((s,p)=>s+p.amount,0);
if(entry.status==="no_show") return;
if(paid===0) entry.status="unpaid";
else if(paid<entry.totalPrice) entry.status="partial";
else entry.status="paid";
}

/* SAVE ENTRY */
function saveEntry(){
const payments=[];
const depositVal = Number(deposit.value||0);

if(depositVal>0){
payments.push({amount:depositVal,type:"deposit",timestamp:new Date().toISOString()});
}

document.querySelectorAll(".session-date").forEach((d,i)=>{
const amount = Number(document.querySelectorAll(".session-amount")[i].value||0);
if(amount>0){
payments.push({amount,type:"payment",timestamp:new Date(d.value||new Date())});
}
});

const entry={
id:Date.now(),
date:date.value,
client:client.value,
contact:contact.value,
social:social.value,
description:description.value,
location:location.value,
totalPrice:Number(total.value||0),
payments,
status:"partial",
notes:notes.value,
createdAt:new Date().toISOString(),
updatedAt:new Date().toISOString(),
editHistory:[]
};

calculateStatus(entry);
entries.push(entry);
save();
closeForm();
}

/* GROUP + RENDER */
function render(){
app.innerHTML="";
const grouped={};

entries.forEach(e=>{
const y=new Date(e.date).getFullYear();
const m=new Date(e.date).getMonth();
const d=new Date(e.date).getDate();
if(!grouped[y]) grouped[y]={};
if(!grouped[y][m]) grouped[y][m]={};
if(!grouped[y][m][d]) grouped[y][m][d]=[];
grouped[y][m][d].push(e);
});

Object.keys(grouped).sort((a,b)=>b-a).forEach(y=>{
const yearDiv=document.createElement("div");
yearDiv.className="year";

yearDiv.innerHTML=`
<div class="accordion-header" onclick="toggleAccordion(this)">
<strong>${y}</strong>
</div>
<div class="accordion-content"></div>
`;

const yearContent=yearDiv.querySelector(".accordion-content");

Object.keys(grouped[y]).sort((a,b)=>b-a).forEach(m=>{
const monthDiv=document.createElement("div");
monthDiv.className="month";

monthDiv.innerHTML=`
<div class="accordion-header" onclick="toggleAccordion(this)">
<strong>${new Date(y,m).toLocaleString('default',{month:'long'})}</strong>
</div>
<div class="accordion-content"></div>
`;

const monthContent=monthDiv.querySelector(".accordion-content");

Object.keys(grouped[y][m]).sort((a,b)=>b-a).forEach(d=>{
const dayDiv=document.createElement("div");
dayDiv.className="day";

dayDiv.innerHTML=`
<div class="accordion-header" onclick="toggleAccordion(this)">
<strong>${y}-${Number(m)+1}-${d}</strong>
</div>
<div class="accordion-content"></div>
`;

const dayContent=dayDiv.querySelector(".accordion-content");

grouped[y][m][d].forEach(entry=>{
const earned = entry.payments.reduce((s,p)=>s+p.amount,0);
const div=document.createElement("div");
div.className="entry";
div.innerHTML=`
<span>${entry.client} - $${earned}</span>
<span class="status ${entry.status}">${entry.status}</span>
`;
div.onclick=()=>viewEntry(entry.id);
dayContent.appendChild(div);
});

monthContent.appendChild(dayDiv);
});

yearContent.appendChild(monthDiv);
});

app.appendChild(yearDiv);
});

calculateTotals();
}

/* TOTALS */
function calculateTotals(){
const now=new Date();
let today=0,week=0,month=0,year=0;

entries.forEach(e=>{
const earned=e.payments.reduce((s,p)=>s+p.amount,0);
const d=new Date(e.date);

if(e.date===now.toISOString().split("T")[0]) today+=earned;
if(d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()) month+=earned;
if(d.getFullYear()===now.getFullYear()) year+=earned;
if((now-d)/(1000*60*60*24)<=7) week+=earned;
});

todayTotal.innerText="$"+today;
weekTotal.innerText="$"+week;
monthTotal.innerText="$"+month;
yearTotal.innerText="$"+year;
}

/* VIEW ENTRY */
function viewEntry(id){
const entry=entries.find(e=>e.id===id);
const earned=entry.payments.reduce((s,p)=>s+p.amount,0);
const remaining=entry.totalPrice-earned;

viewContent.innerHTML=`
<h3>${entry.client}</h3>
<p>Status: ${entry.status}</p>
<p>Date: ${entry.date}</p>
<p>Total: $${entry.totalPrice}</p>
<p>Paid: $${earned}</p>
<p>Remaining: $${remaining}</p>
<p>Description: ${entry.description}</p>
<p>Location: ${entry.location}</p>
<p>Contact: ${entry.contact}</p>
<p>Social: ${entry.social}</p>
<p>Notes: ${entry.notes}</p>
<h4>Edit History</h4>
${entry.editHistory.map(h=>`<p>${h.timestamp}: ${h.field} changed</p>`).join("")}
<button onclick="closeView()">Close</button>
`;

viewModal.style.display="flex";
}

function closeView(){
viewModal.style.display="none";
}

render();