

/* =============================
         MODAL FUNCTIONS (Option B)
      ============================== */
      function showModal(message, type = "error") {
        const modal = document.getElementById("amcarModal");
        document.getElementById("modalMessage").innerText = message;
        document.getElementById("modalTitle").style.color =
          type === "success" ? "#4bff4b" : "#ff4b4b";
        modal.style.display = "flex";

        // Disable ESC closing
        document.body.onkeydown = function (event) {
          if (event.key === "Escape") {
            event.preventDefault();
          }
        };
      }

      function closeModal() {
        const modal = document.getElementById("amcarModal");
        modal.style.display = "none";

        // Re-enable ESC key
        document.body.onkeydown = null;

        // Option B: reload page after user clicks OK
        setTimeout(() => location.reload(), 200);
      }
      /* =============================
         USER + LAST PART DISPLAY
      ============================== */

      
      const userDisplay = localStorage.getItem("user");

      if (userDisplay) {
        document.getElementById("usernameDisplay").innerText = userDisplay;
      }

      if (userDisplay && userDisplay.trim().toLowerCase() === "admin") {
        document.getElementById("downloadSection").style.display = "block";
      }

      const savedLastPart = localStorage.getItem("lastPart");
      if (savedLastPart) {
        document.getElementById("lastPartDisplay").innerText = savedLastPart;
      }

      function updateLastPart(part) {
        document.getElementById("lastPartDisplay").innerText = part;
        localStorage.setItem("lastPart", part);
      }

      function logout() {
        localStorage.removeItem("user");
        localStorage.removeItem("lastPart");
        window.location.href = "login.html";
      }
    
      /* =============================
         PARTS DATA + BARCODE HANDLING
      ============================== */
      let partsData = [];
      // GLOBAL VARIABLES (must exist before use)
let currentCode = "";
let currentDescription = "";
let currentMMPCPart = "";
let isManual = false;


      async function loadParts() {
        try {
          const response = await fetch("/api/parts");
          partsData = await response.json();
          console.log("Parts loaded:", partsData);
        } catch (error) {
          console.error("Error loading parts:", error);
        }
      }
      loadParts();

      document
        .getElementById("barcodeInput")
        .addEventListener("change", handleImageUpload);

      async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const preview = document.getElementById("preview");
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";

        const processedBlob = await preprocessImage(file);

        let barcode;
        try {
          barcode = await decodeImage(processedBlob);
        } catch (err) {
          showModal("❌ Barcode could not be read.");
          console.log(err);
          return;
        }

        document.getElementById("decodedText").textContent = barcode;
        document.getElementById("codeField").textContent = barcode;

        const part = partsData.find((p) => p.code === barcode);

        if (!part) {
          showModal("❌ Unknown part code — not in database.");
          return;
        }

        document.getElementById("description").textContent = part.description;
        document.getElementById("mmpcField").textContent =
          part.mmpcPart || "No";

        // Update global state so submitForm() sends the correct code/description
        currentCode = barcode;
        currentDescription = part.description || "";
        currentMMPCPart = part.mmpcPart || "No";
        isManual = false;

        // Do NOT persist as "lastPart" here — only persist when the entry is saved.
        // The decoded barcode is shown in the UI but should not become the
        // "Last Part" until the user saves (submitForm handles setting lastPart).

        document.getElementById("resultBox").style.display = "block";
        document.getElementById("formBox").style.display = "block";
      }

      async function preprocessImage(file) {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX = 800;
        const scale = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
      }

      function decodeImage(buffer) {
        return new Promise((resolve, reject) => {
          Quagga.decodeSingle(
            {
              src: URL.createObjectURL(buffer),
              numOfWorkers: 0,
              locate: true,
              inputStream: { size: 800 },
              decoder: {
                readers: [
                  "code_128_reader",
                  "code_39_reader",
                  "code_93_reader",
                  "ean_reader",
                  "ean_8_reader",
                  "upc_reader",
                ],
              },
            },
            (result) => {
              if (result && result.codeResult) {
                resolve(result.codeResult.code);
              } else {
                reject("No barcode detected");
              }
            }
          );
        });
      }

      async function submitForm() {
        const quantity = document.getElementById("quantity").value.trim();
        const location = document.getElementById("location").value.trim();

        // Validate required fields
        if (!quantity) {
          showModal("❌ Quantity is required.");
          return;
        }
        if (!location) {
          showModal("❌ Location is required.");
          return;
        }

        const user = localStorage.getItem("user");
    
        const payload = {
            code: currentCode,
            description: currentDescription,
            quantity: quantity,
            location: location,
            encodedBy: user,  // ← FIXED
            manual: isManual,
            mmpcPart: currentMMPCPart || "No"
        };
    
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
    
          const data = await res.json();
          if (data.success) {
            // Update last part display
            localStorage.setItem("lastPart", currentCode);
            document.getElementById("lastPartDisplay").textContent = currentCode;
            showModal("Scan saved successfully!");
          } else {
              showModal("❌ Error: " + (data.message || "Failed to save"));
          }
        } catch (err) {
          showModal("❌ Server error: " + err.message);
          console.error("Submit error:", err);
        }
    }
    async function getDescription(code) {
      const res = await fetch("/api/parts");
      const parts = await res.json();
  
      const match = parts.find(p => p.code === code);
  
      return match ? match.description : "";
  }
  
  async function handleScannedCode(scannedCode) {
    currentCode = scannedCode;

    currentDescription = await getDescription(scannedCode);
    document.getElementById("description").innerText = currentDescription || "(No description)";
}


    

      /* =============================
         MANUAL ENTRY
      ============================== */
    //   function updateDescriptionFromCode(code) {
    //     const descDisplay = document.getElementById("description");
    //     if (!partsData.length) {
    //       descDisplay.textContent = "Parts not loaded yet";
    //       return;
    //     }

    //     const part = partsData.find((p) => p.code === code);
    //     if (part) {
    //       descDisplay.textContent = part.description;
    //       document.getElementById("mmpcField").textContent =
    //         part.mmpcPart || "No";
    //     } else {
    //       showModal("❌ Unknown part code — not in database.");
    //     }
    //   }

    //   function useManualCode() {
    //     const manualCode = document.getElementById("manualCodeInput").value.trim();
    //     if (!manualCode) {
    //       showModal("⚠️ Please enter a part code.");
    //       return;
    //     }
      
    //     const part = partsData.find(p => p.code === manualCode);
      
    //     if (!part) {
    //       showModal("❌ Unknown part code — not in database.");
    //       return;
    //     }
      
    //     // ⭐ Set GLOBAL values
    //     currentCode = manualCode;
    //     currentDescription = part.description;
    //     currentMMPCPart = part.mmpcPart || "No";
    //     isManual = true;
      
    //     // Render to UI
    //     document.getElementById("decodedText").textContent = manualCode;
    //     document.getElementById("codeField").textContent = manualCode;
    //     document.getElementById("description").textContent = currentDescription;
    //     document.getElementById("mmpcField").textContent = currentMMPCPart;
      
    //     document.getElementById("resultBox").style.display = "block";
    //     document.getElementById("formBox").style.display = "block";
    //     document.getElementById("preview").style.display = "none";
    //   }
      

      async function downloadCSV() {
        try {
            const response = await fetch("/api/export-csv");
    
            if (!response.ok) {
                showModal("❌ Failed to download CSV.");
                return;
            }
    
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
    
            // Create the link INSIDE the user click
            const a = document.createElement("a");
            a.href = url;
            a.download = "inventory_export.csv";
            document.body.appendChild(a);
    
            a.click();  // ← Browser sees this as user-triggered
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            showModal("❌ Download failed.");
            console.error(error);
        }
    }

    /* =============================
   LIVE MANUAL ENTRY SEARCH
============================= */



const manualInput = document.getElementById("manualCodeInput");
const suggestionsBox = document.getElementById("suggestionsBox");

manualInput.addEventListener("input", () => {
    const query = manualInput.value.trim().toLowerCase();

    if (!query) {
        suggestionsBox.style.display = "none";
        return;
    }

    // Filter matches
    const results = partsData.filter(p => 
        p.code.toLowerCase().includes(query)
    );

    // Build suggestions
    if (results.length > 0) {
        suggestionsBox.innerHTML = results
            .map(r => `<div data-code="${r.code}">${r.code} — ${r.description}</div>`)
            .join("");

        suggestionsBox.style.display = "block";
    } else {
        suggestionsBox.style.display = "none";
    }
});

// When clicking a suggestion
suggestionsBox.addEventListener("click", (e) => {
    const selected = e.target.getAttribute("data-code");
    if (!selected) return;

    const part = partsData.find(p => p.code === selected);

    // update globals
    currentCode = part.code;
    currentDescription = part.description;
    currentMMPCPart = part.mmpcPart || "No";
    isManual = true;

    // Fill input
    manualInput.value = part.code;

    // Render UI
    document.getElementById("decodedText").textContent = part.code;
    document.getElementById("codeField").textContent = part.code;
    document.getElementById("description").textContent = part.description;
    document.getElementById("mmpcField").textContent = currentMMPCPart;

    // Show result boxes
    document.getElementById("resultBox").style.display = "block";
    document.getElementById("formBox").style.display = "block";

    // Hide suggestions
    suggestionsBox.style.display = "none";
});