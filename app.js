let entries = JSON.parse(localStorage.getItem("entries") || "[]");

/* ---------- SAVE ---------- */
function save(){
localStorage.setItem("entries", JSON.stringify(entries));
render();
}

/* ---------- FORM ---------- */
function openForm(){
document.getElementById("formModal").style.display="flex";
document.getElementById("date").value=
new Date().toISOString().split("T")[0];
}

function closeForm(){
document.getElementById("formModal").style.display="none";
document.getElementById("sessions").innerHTML="";
}

/* ---------- ADD SESSION ---------- */
function addSession(){
const container=document.getElementById("sessions");
const input=document.createElement("input");
input.type="number";
input.className="session-amount";
input.placeholder="Session Amount";
container.appendChild(input);
}

/* ---------- STATUS ---------- */
function getStatus(entry){
const paid=entry.payments.reduce((s,p)=>s+p.amount,0);
if(paid===0) return "unpaid";
if(paid<entry.total) return "partial";
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

const reader=new FileReader();
const file=document.getElementById("image").files[0];

const entry={
id:Date.now(),
date:document.getElementById("date").value,
client:document.getElementById("client").value||"Unnamed",
contact:document.getElementById("contact").value||"",
social:document.getElementById("social").value||"",
description:document.getElementById("description").value||"",
location:document.getElementById("location").value||"",
notes:document.getElementById("notes").value||"",
total:Number(document.getElementById("total").value||0),
payments:payments,
image:null
};

function finalize(){
entries.push(entry);
save();
closeForm();
}

if(file){
reader.onload=function(e){
entry.image=e.target.result;
finalize();
};
reader.readAsDataURL(file);
}else{
finalize();
}
}

/* ---------- RENDER ---------- */
function render(){

const container=document.getElementById("entries");
container.innerHTML="";

if(entries.length===0){
container.innerHTML="<p style='opacity:.6;'>No entries yet.</p>";
updateStats();
return;
}

entries.slice().reverse().forEach(e=>{
const paid=e.payments.reduce((s,p)=>s+p.amount,0);
const status=getStatus(e);

const div=document.createElement("div");
div.className="card";
div.innerHTML=`
<strong>${e.client}</strong><br>
${e.date}<br>
$${paid} / $${e.total}
<span class="status ${status}">${status}</span>
`;

div.onclick=function(){viewEntry(e.id)};
container.appendChild(div);
});

updateStats();
}

/* ---------- VIEW ENTRY ---------- */
function viewEntry(id){
const entry=entries.find(e=>e.id===id);
const paid=entry.payments.reduce((s,p)=>s+p.amount,0);
const remaining=entry.total-paid;

document.getElementById("viewBox").innerHTML=`
<h3>${entry.client}</h3>
<p><strong>Date:</strong> ${entry.date}</p>
<p><strong>Status:</strong> ${getStatus(entry)}</p>
<p><strong>Total:</strong> $${entry.total}</p>
<p><strong>Paid:</strong> $${paid}</p>
<p><strong>Remaining:</strong> $${remaining}</p>
<p><strong>Description:</strong> ${entry.description}</p>
<p><strong>Location:</strong> ${entry.location}</p>
<p><strong>Contact:</strong> ${entry.contact}</p>
<p><strong>Social:</strong> ${entry.social}</p>
<p><strong>Notes:</strong> ${entry.notes}</p>
${entry.image ? `<img src="${entry.image}" style="width:100%; margin-top:10px;">` : ""}
<button onclick="closeView()">Close</button>
`;

document.getElementById("viewModal").style.display="flex";
}

function closeView(){
document.getElementById("viewModal").style.display="none";
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

render();