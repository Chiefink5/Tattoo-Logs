// ===== DATA MODEL =====

const STORAGE = {
  clients: "clients_v2",
  entries: "entries_v2",
  studio: "studio_v2",
  logo: "logo_v2"
};

let clients = JSON.parse(localStorage.getItem(STORAGE.clients)) || [];
let entries = JSON.parse(localStorage.getItem(STORAGE.entries)) || [];
let studio = JSON.parse(localStorage.getItem(STORAGE.studio)) || {
  splitDefaultPct: 60,
  rewards: []
};

function saveAll(){
  localStorage.setItem(STORAGE.clients, JSON.stringify(clients));
  localStorage.setItem(STORAGE.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE.studio, JSON.stringify(studio));
}

// ===== AUTOMATION ENGINE =====

function recalcClient(clientId){
  const client = clients.find(c=>c.id===clientId);
  if(!client) return;

  const clientEntries = entries.filter(e=>e.clientId===clientId);
  client.tattooCount = clientEntries.length;
  client.totalSpent = clientEntries.reduce((sum,e)=>sum+e.total,0);

  // level system
  if(client.tattooCount >= 10) client.level="Legend";
  else if(client.tattooCount >=5) client.level="VIP";
  else client.level="Standard";
}

// ===== UI RENDER =====

function render(){
  const container = document.getElementById("entries");
  container.innerHTML="";

  entries.forEach(e=>{
    const client = clients.find(c=>c.id===e.clientId);
    const div = document.createElement("div");
    div.className="entry";
    div.innerHTML=`
      <div><strong>${client?.name||""}</strong></div>
      <div>$${e.total} • ${e.status}</div>
    `;
    container.appendChild(div);
  });

  updateStats();
}

function updateStats(){
  const today = new Date().toISOString().split("T")[0];
  const todayTotal = entries
    .filter(e=>e.date===today)
    .reduce((s,e)=>s+e.total*(studio.splitDefaultPct/100),0);

  document.getElementById("todayTotal").innerText="$"+todayTotal;
}

// ===== MODALS =====

function openForm(){
  const name = prompt("Client name:");
  if(!name) return;

  let client = clients.find(c=>c.name===name);
  if(!client){
    client = { id:Date.now(), name, totalSpent:0, tattooCount:0, level:"Standard" };
    clients.push(client);
  }

  const total = Number(prompt("Total price:")||0);

  entries.push({
    id:Date.now(),
    clientId:client.id,
    total,
    date:new Date().toISOString().split("T")[0],
    status:"paid"
  });

  recalcClient(client.id);
  saveAll();
  render();
  toast("Entry added");
}

function openDepositQuick(){
  toast("Deposit flow coming next phase");
}

function openBammerQuick(){
  toast("Bammer flow coming next phase");
}

function openAppointments(){
  toast("Appointments screen phase 2");
}

function openStudio(){
  const pct = prompt("Set default split %:", studio.splitDefaultPct);
  if(pct){
    studio.splitDefaultPct=Number(pct);
    saveAll();
    render();
  }
}

function openExport(){
  toast("Export phase next");
}

// ===== TOAST =====

function toast(msg){
  const el = document.createElement("div");
  el.className="toast";
  el.innerText=msg;
  document.getElementById("toasts").appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

// ===== INIT =====

document.getElementById("fabAdd").onclick=openForm;
document.getElementById("fabDeposit").onclick=openDepositQuick;
document.getElementById("fabBammer").onclick=openBammerQuick;

render();