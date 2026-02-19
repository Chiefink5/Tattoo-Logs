let entries = JSON.parse(localStorage.getItem("entries") || "[]");

function openForm(){
document.getElementById("formModal").style.display="flex";
document.getElementById("date").value = new Date().toISOString().split("T")[0];
}

function closeForm(){
document.getElementById("formModal").style.display="none";
}

function saveEntry(){
const reader = new FileReader();
const imgFile = document.getElementById("image").files[0];

const entry = {
id: Date.now(),
date: document.getElementById("date").value,
client: client.value,
contact: contact.value,
social: social.value,
description: description.value,
location: location.value,
total: Number(total.value||0),
deposit: Number(deposit.value||0),
additional: Number(additional.value||0),
notes: notes.value,
image:null,
created: new Date().toISOString(),
edited:null,
history:[]
};

entry.remaining = entry.total - (entry.deposit + entry.additional);

if(imgFile){
reader.onload = function(e){
entry.image = e.target.result;
entries.push(entry);
save();
};
reader.readAsDataURL(imgFile);
}else{
entries.push(entry);
save();
}

closeForm();
}

function save(){
localStorage.setItem("entries", JSON.stringify(entries));
render();
}

function render(){
const app = document.getElementById("app");
app.innerHTML="";

let grouped = {};

entries.forEach(e=>{
if(!grouped[e.date]) grouped[e.date]=[];
grouped[e.date].push(e);
});

Object.keys(grouped).sort().reverse().forEach(date=>{
const dayDiv = document.createElement("div");
dayDiv.className="day";
dayDiv.innerHTML=`<strong>${date}</strong>`;

grouped[date].forEach(entry=>{
const div = document.createElement("div");
div.className="entry";
div.innerText = `${entry.client} - $${entry.deposit + entry.additional}`;
div.onclick = ()=>viewEntry(entry.id);
dayDiv.appendChild(div);
});

app.appendChild(dayDiv);
});

calculateTotals();
}

function calculateTotals(){
let today = new Date().toISOString().split("T")[0];
let todaySum=0, weekSum=0, monthSum=0, yearSum=0;

entries.forEach(e=>{
let earned = e.deposit + e.additional;
if(e.date === today) todaySum+=earned;

let d = new Date(e.date);
let now = new Date();

if(d.getFullYear()===now.getFullYear()) yearSum+=earned;
if(d.getMonth()===now.getMonth()) monthSum+=earned;

let diff = (now - d)/(1000*60*60*24);
if(diff<=7) weekSum+=earned;
});

todayTotal.innerText="$"+todaySum;
weekTotal.innerText="$"+weekSum;
monthTotal.innerText="$"+monthSum;
yearTotal.innerText="$"+yearSum;
}

function viewEntry(id){
let entry = entries.find(e=>e.id===id);
let modal = document.getElementById("viewModal");
let content = document.getElementById("viewContent");

content.innerHTML=`
<h3>${entry.client}</h3>
<p>Date: ${entry.date}</p>
<p>Description: ${entry.description}</p>
<p>Location: ${entry.location}</p>
<p>Total: $${entry.total}</p>
<p>Deposit: $${entry.deposit}</p>
<p>Additional: $${entry.additional}</p>
<p>Remaining: $${entry.remaining}</p>
<p>Contact: ${entry.contact}</p>
<p>Social: ${entry.social}</p>
<p>Notes: ${entry.notes}</p>
${entry.image ? `<img src="${entry.image}" style="width:100%">` : ""}
<button onclick="closeView()">Close</button>
`;

modal.style.display="flex";
}

function closeView(){
document.getElementById("viewModal").style.display="none";
}

render();