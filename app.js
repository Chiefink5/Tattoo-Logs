let entries = JSON.parse(localStorage.getItem("entries") || "[]");

function save(){
localStorage.setItem("entries",
alert("Saving...");
 JSON.stringify(entries));
render();
}

function openForm(){
document.getElementById("form").style.display="block";
document.getElementById("date").value =
new Date().toISOString().split("T")[0];
}

function closeForm(){
document.getElementById("form").style.display="none";
document.getElementById("sessions").innerHTML="";
}

function addSession(){
const container=document.getElementById("sessions");
const div=document.createElement("div");

div.innerHTML=`
<input type="date" class="session-date">
<input type="number" class="session-amount" placeholder="Session Amount">
`;

container.appendChild(div);
}

function saveEntry(){

const payments=[];

const depositVal=Number(document.getElementById("deposit").value||0);

if(depositVal>0){
payments.push({
amount:depositVal,
type:"deposit"
});
}

const sessionDates=document.querySelectorAll(".session-date");
const sessionAmounts=document.querySelectorAll(".session-amount");

sessionDates.forEach((d,i)=>{
const amount=Number(sessionAmounts[i].value||0);
if(amount>0){
payments.push({
amount:amount,
type:"payment"
});
}
});

const reader=new FileReader();
const file=document.getElementById("image").files[0];

const entry={
id:Date.now(),
date:document.getElementById("date").value,
client:document.getElementById("client").value,
total:Number(document.getElementById("total").value||0),
payments:payments,
image:null
};

if(file){
reader.onload=function(e){
entry.image=e.target.result;
entries.push(entry);
save();
};
reader.readAsDataURL(file);
}else{
entries.push(entry);
save();
}

closeForm();
}

function render(){
const container=document.getElementById("entries");
container.innerHTML="";

entries.forEach(e=>{
const earned=e.payments.reduce((s,p)=>s+p.amount,0);

const div=document.createElement("div");
div.className="entry";

div.innerHTML=`
<strong>${e.client}</strong><br>
Date: ${e.date}<br>
Paid: $${earned} / $${e.total}
${e.image ? `<br><img src="${e.image}" style="width:100px">` : ""}
`;

container.appendChild(div);
});
}

render();

console.log("Entries:", entries);

