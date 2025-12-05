async function loadTable() {
    const response = await fetch("/api/scans");
    let data = await response.json();
  
    // Sort by newest entries first (assuming each entry has "date")
    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
    // Keep only the latest 20
    data = data.slice(0, 20);
  
    const tbody = document.querySelector("#dataTable tbody");
    tbody.innerHTML = "";
  
    data.forEach((row, index) => {
      const tr = document.createElement("tr");
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
  

async function editRow(index, btn) {
    const tr = btn.parentNode.parentNode;
    const inputs = tr.querySelectorAll("input");

    if (btn.textContent === "💾") {
        // Save
        const updated = {};
        inputs.forEach(input => {
            const field = input.dataset.field;
            updated[field] = input.value;
        });

        await fetch(`/api/scans/${index}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated)
        });

        btn.textContent = "✏️";
        inputs.forEach(i => i.disabled = true);
        return;
    }

    btn.textContent = "💾";
    inputs.forEach(i => i.disabled = false);
}

async function deleteRow(index) {
    if (!confirm("Delete this entry?")) return;

    await fetch(`/api/scans/${index}`, { method: "DELETE" });
    loadTable();
}

window.onload = loadTable;
setInterval(loadTable, 3000);

