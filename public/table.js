let isEditing = false;

async function loadTable() {
  const response = await fetch("/api/scans");
  let data = await response.json();

  // Add the real index before sorting so PUT works
  data = data.map((row, idx) => ({ ...row, realIndex: idx }));

  data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  data = data.slice(0, 20);

  const tbody = document.querySelector("#dataTable tbody");
  tbody.innerHTML = "";

  data.forEach((row, index) => {
    const tr = document.createElement("tr");

    tr.dataset.realIndex = row.realIndex;  // << store REAL index

    tr.innerHTML = `
      <td>${row.code}</td>
      <td>${row.description}</td>
      <td>${row.mmpcPart}</td>
      <td>${row.quantity}</td>
      <td>${row.location}</td>
      <td>${row.encodedBy || "—"}</td>
      <td>${row.timestamp}</td>
      <td>
        <button onclick="editRow(${index})">Edit</button>
        <button onclick="deleteRow(${index})">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}


  

  async function editRow(index) {
    const tr = document.querySelectorAll("#dataTable tbody tr")[index];
    const btn = tr.querySelector("button");
  
    if (btn.textContent === "Edit") {
      isEditing = true;
      btn.textContent = "Save";
  
      // Convert each editable cell into an input
      const fields = ["code", "description", "mmpcPart", "quantity", "location"];
  
      fields.forEach((field, i) => {
        const td = tr.children[i];
        const value = td.textContent.trim();
        td.innerHTML = `<input data-field="${field}" value="${value}">`;
      });
  
      return;
    }
  
    // SAVE

const realIndex = tr.dataset.realIndex;  // <--- FIXED!!

const inputs = tr.querySelectorAll("input");
const updated = {};

inputs.forEach(input => {
  updated[input.dataset.field] = input.value;
});

await fetch(`/api/scans/${realIndex}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(updated)
});

isEditing = false;
btn.textContent = "Edit";
loadTable();

  
    isEditing = false;
    btn.textContent = "Edit";
    loadTable();
  }
  

async function deleteRow(index) {
    if (!confirm("Delete this entry?")) return;

    const tr = document.querySelectorAll("#dataTable tbody tr")[index];
const realIndex = tr.dataset.realIndex;

    await fetch(`/api/scans/${realIndex}`, { method: "DELETE" });
    loadTable();
}



window.onload = loadTable;
setInterval(() => {
  if (!isEditing) loadTable();
}, 3000);


