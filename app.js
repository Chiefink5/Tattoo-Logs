let entries = JSON.parse(localStorage.getItem("entries") || "[]");

/* ================= SAVE ================= */
function save() {
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}

/* ================= MODALS ================= */
const formModal = document.getElementById("formModal");
const viewModal = document.getElementById("viewModal");

function openForm() {
  formModal.style.display = "flex";
  document.getElementById("date").value =
    new Date().toISOString().split("T")[0];
}

function closeForm() {
  formModal.style.display = "none";
  resetForm();
}

function resetForm(){
  document.getElementById("date").value="";
  document.getElementById("client").value="";
  document.getElementById("contact").value="";
  document.getElementById("social").value="";
  document.getElementById("description").value="";
  document.getElementById("location").value="";
  document.getElementById("notes").value="";
  document.getElementById("total").value="";
  document.getElementById("deposit").value="";
  document.getElementById("image").value="";
  document.getElementById("sessions").innerHTML="";
  document.getElementById("status").value="unpaid";
}

function closeView() {
  viewModal.style.display = "none";
}

/* Click outside modal to close */
formModal.addEventListener("click", function (e) {
  if (e.target === formModal) closeForm();
});

viewModal.addEventListener("click", function (e) {
  if (e.target === viewModal) closeView();
});

/* ================= ADD SESSION ================= */
function addSession() {
  const container = document.getElementById("sessions");
  const input = document.createElement("input");
  input.type = "number";
  input.className = "session-amount";
  input.placeholder = "Session Amount";
  container.appendChild(input);
}

/* ================= SAVE ENTRY ================= */
function saveEntry() {

  const dateVal = document.getElementById("date").value;
  const clientVal = document.getElementById("client").value.trim();

  if (!dateVal || !clientVal) {
    alert("Date and Client Name required.");
    return;
  }

  const payments = [];

  const depositVal = Number(document.getElementById("deposit").value || 0);
  if (depositVal > 0) {
    payments.push({ amount: depositVal });
  }

  document.querySelectorAll(".session-amount").forEach(input => {
    const val = Number(input.value || 0);
    if (val > 0) payments.push({ amount: val });
  });

  const entry = {
    id: Date.now(),
    date: dateVal,
    client: clientVal,
    contact: document.getElementById("contact").value || "",
    social: document.getElementById("social").value || "",
    description: document.getElementById("description").value || "",
    location: document.getElementById("location").value || "",
    notes: document.getElementById("notes").value || "",
    total: Number(document.getElementById("total").value || 0),
    payments: payments,
    status: document.getElementById("status").value,
    image: null
  };

  const file = document.getElementById("image").files[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      entry.image = e.target.result;
      entries.push(entry);
      save();
      closeForm();
    };
    reader.readAsDataURL(file);
  } else {
    entries.push(entry);
    save();
    closeForm();
  }
}

/* ================= RENDER ================= */
function render() {
  const container = document.getElementById("entries");
  container.innerHTML = "";

  if (entries.length === 0) {
    container.innerHTML = "<p style='opacity:.6;'>No entries yet.</p>";
    updateStats();
    return;
  }

  entries.slice().reverse().forEach(e => {
    const paid = e.payments.reduce((s, p) => s + p.amount, 0);

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <strong>${e.client}</strong><br>
      ${e.date}<br>
      $${paid} / $${e.total}
      <span class="status ${e.status}">${e.status}</span>
    `;

    div.onclick = function () {
      viewEntry(e.id);
    };

    container.appendChild(div);
  });

  updateStats();
}

/* ================= VIEW ENTRY ================= */
function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  const paid = entry.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = entry.total - paid;

  document.getElementById("viewBox").innerHTML = `
    <h3>${entry.client}</h3>
    <p>Status: ${entry.status}</p>
    <p>Total: $${entry.total}</p>
    <p>Paid: $${paid}</p>
    <p>Remaining: $${remaining}</p>
    <p>Description: ${entry.description}</p>
    <p>Location: ${entry.location}</p>
    <p>Contact: ${entry.contact}</p>
    <p>Social: ${entry.social}</p>
    <p>Notes: ${entry.notes}</p>
    ${entry.image ? `<img src="${entry.image}" style="width:100%; margin-top:10px;">` : ""}
  `;

  viewModal.style.display = "flex";
}

/* ================= STATS ================= */
function updateStats() {
  const now = new Date();
  let today = 0, week = 0, month = 0, year = 0;

  entries.forEach(e => {
    const paid = e.payments.reduce((s, p) => s + p.amount, 0);
    const d = new Date(e.date);

    if (e.date === now.toISOString().split("T")[0]) today += paid;
    if (d.getFullYear() === now.getFullYear()) year += paid;
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) month += paid;
    if ((now - d) / (1000 * 60 * 60 * 24) <= 7) week += paid;
  });

  document.getElementById("todayTotal").innerText = "$" + today;
  document.getElementById("weekTotal").innerText = "$" + week;
  document.getElementById("monthTotal").innerText = "$" + month;
  document.getElementById("yearTotal").innerText = "$" + year;
}

render();