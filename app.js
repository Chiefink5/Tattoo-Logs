// ================= STATE =================
let entries = JSON.parse(localStorage.getItem("entries") || "[]");

// ================= SAVE =================
function save() {
  localStorage.setItem("entries", JSON.stringify(entries));
  render();
}

// ================= MODALS =================
const formModal = document.getElementById("formModal");
const viewModal = document.getElementById("viewModal");

function openForm() {
  if (!formModal) return;
  formModal.style.display = "flex";

  const dateInput = document.getElementById("date");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }
}

function closeForm() {
  if (!formModal) return;
  formModal.style.display = "none";
  resetForm();
}

function closeView() {
  if (!viewModal) return;
  viewModal.style.display = "none";
}

// Click outside to close
if (formModal) {
  formModal.addEventListener("click", function (e) {
    if (e.target === formModal) closeForm();
  });
}

if (viewModal) {
  viewModal.addEventListener("click", function (e) {
    if (e.target === viewModal) closeView();
  });
}

// ================= RESET FORM =================
function resetForm() {
  const modal = document.getElementById("formModal");
  if (!modal) return;

  modal.querySelectorAll("input, textarea, select").forEach(el => {
    if (el.type === "file") {
      el.value = "";
    } else {
      el.value = "";
    }
  });

  const sessions = document.getElementById("sessions");
  if (sessions) sessions.innerHTML = "";
}

// ================= ADD SESSION =================
function addSession() {
  const container = document.getElementById("sessions");
  if (!container) return;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "session-amount";
  input.placeholder = "Session Amount";

  container.appendChild(input);
}

// ================= STATUS =================
function getStatus(entry) {
  if (entry.status) return entry.status;

  const paid = entry.payments.reduce((sum, p) => sum + p.amount, 0);

  if (paid === 0) return "unpaid";
  if (paid < entry.total) return "partial";
  return "paid";
}

// ================= SAVE ENTRY =================
function saveEntry() {
  const dateEl = document.getElementById("date");
  const clientEl = document.getElementById("client");
  const totalEl = document.getElementById("total");
  const depositEl = document.getElementById("deposit");
  const statusEl = document.getElementById("status");
  const imageEl = document.getElementById("image");

  if (!dateEl || !clientEl) {
    alert("Required fields missing.");
    return;
  }

  const dateVal = dateEl.value;
  const clientVal = clientEl.value.trim();

  if (!dateVal || !clientVal) {
    alert("Date and Client Name are required.");
    return;
  }

  const payments = [];

  const depositVal = depositEl ? Number(depositEl.value || 0) : 0;
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
    total: totalEl ? Number(totalEl.value || 0) : 0,
    payments: payments,
    status: statusEl ? statusEl.value : "unpaid",
    contact: document.getElementById("contact") ? document.getElementById("contact").value : "",
    social: document.getElementById("social") ? document.getElementById("social").value : "",
    description: document.getElementById("description") ? document.getElementById("description").value : "",
    location: document.getElementById("location") ? document.getElementById("location").value : "",
    notes: document.getElementById("notes") ? document.getElementById("notes").value : "",
    image: null
  };

  function finalizeSave() {
    entries.push(entry);
    save();
    closeForm();
  }

  if (imageEl && imageEl.files && imageEl.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      entry.image = e.target.result;
      finalizeSave();
    };
    reader.readAsDataURL(imageEl.files[0]);
  } else {
    finalizeSave();
  }
}

// ================= RENDER =================
function render() {
  const container = document.getElementById("entries");
  if (!container) return;

  container.innerHTML = "";

  if (entries.length === 0) {
    container.innerHTML = "<p style='opacity:.6;'>No entries yet.</p>";
    updateStats();
    return;
  }

  entries.slice().reverse().forEach(entry => {
    const paid = entry.payments.reduce((sum, p) => sum + p.amount, 0);
    const status = getStatus(entry);

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <strong>${entry.client}</strong><br>
      ${entry.date}<br>
      $${paid} / $${entry.total}
      <span class="status ${status}">${status}</span>
    `;

    div.onclick = function () {
      viewEntry(entry.id);
    };

    container.appendChild(div);
  });

  updateStats();
}

// ================= VIEW ENTRY =================
function viewEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const paid = entry.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = entry.total - paid;

  const viewBox = document.getElementById("viewBox");
  if (!viewBox) return;

  viewBox.innerHTML = `
    <h3>${entry.client}</h3>
    <p>Status: ${getStatus(entry)}</p>
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

  if (viewModal) viewModal.style.display = "flex";
}

// ================= STATS =================
function updateStats() {
  const todayEl = document.getElementById("todayTotal");
  const weekEl = document.getElementById("weekTotal");
  const monthEl = document.getElementById("monthTotal");
  const yearEl = document.getElementById("yearTotal");

  if (!todayEl) return;

  const now = new Date();
  let today = 0, week = 0, month = 0, year = 0;

  entries.forEach(entry => {
    const paid = entry.payments.reduce((sum, p) => sum + p.amount, 0);
    const d = new Date(entry.date);

    if (entry.date === now.toISOString().split("T")[0]) today += paid;
    if (d.getFullYear() === now.getFullYear()) year += paid;
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) month += paid;
    if ((now - d) / (1000 * 60 * 60 * 24) <= 7) week += paid;
  });

  todayEl.innerText = "$" + today;
  if (weekEl) weekEl.innerText = "$" + week;
  if (monthEl) monthEl.innerText = "$" + month;
  if (yearEl) yearEl.innerText = "$" + year;
}

// ================= INIT =================
render();