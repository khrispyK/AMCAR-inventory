

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

      // Restore last used location (persisted between saves)
      const savedLastLocation = localStorage.getItem("lastLocation");
      if (savedLastLocation) {
        const locInput = document.getElementById("location");
        if (locInput) locInput.value = savedLastLocation;
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

        // Choose a target size to make small barcodes larger for decoding
        const TARGET = 1200; // desired minimum dimension
        const MAX_UPSCALE = 2.0; // avoid extreme upscaling

        // Compute scale factor (allow upscaling for small images, but cap it)
        let scale = Math.max(TARGET / img.width, TARGET / img.height);
        if (scale > MAX_UPSCALE) scale = MAX_UPSCALE;
        if (scale < 0.5) scale = 0.5; // avoid extremely small outputs

        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        // Draw scaled image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply simple contrast + brightness adjustment and sharpening
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // contrast/brightness: linear transform
          const contrast = 1.2; // >1 increases contrast
          const brightness = 0; // can tweak if needed

          // apply contrast and convert to grayscale roughly for thresholding
          for (let i = 0; i < data.length; i += 4) {
            // RGB
            for (let c = 0; c < 3; c++) {
              let v = data[i + c];
              v = (v - 128) * contrast + 128 + brightness;
              data[i + c] = Math.max(0, Math.min(255, v));
            }
          }

          // Put adjusted data back
          ctx.putImageData(imageData, 0, 0);

          // Sharpen with a convolution kernel
          const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
          const w = canvas.width;
          const h = canvas.height;
          const src = ctx.getImageData(0, 0, w, h);
          const dst = ctx.createImageData(w, h);
          const s = src.data;
          const d = dst.data;

          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              for (let c = 0; c < 3; c++) {
                let i = (y * w + x) * 4 + c;
                let sum = 0;
                // apply 3x3 kernel
                let ki = 0;
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    const xi = x + kx;
                    const yi = y + ky;
                    const ii = (yi * w + xi) * 4 + c;
                    sum += s[ii] * kernel[ki++];
                  }
                }
                d[i] = Math.max(0, Math.min(255, sum));
              }
              // copy alpha
              d[(y * w + x) * 4 + 3] = s[(y * w + x) * 4 + 3];
            }
          }

          ctx.putImageData(dst, 0, 0);
        } catch (err) {
          // If any processing fails, continue with the scaled image
          console.warn("Image preprocessing warning:", err);
        }

        return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      }

      function decodeImage(buffer) {
        return new Promise((resolve, reject) => {
          const config = {
            src: URL.createObjectURL(buffer),
            numOfWorkers: 0,
            locate: true,
            inputStream: { size: 1200 },
            locator: { patchSize: "large", halfSample: false },
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
          };

          Quagga.decodeSingle(config, (result) => {
            if (result && result.codeResult) {
              const barcode = result.codeResult.code;
              const cleanCode = barcode.split(" ")[0];
              resolve(cleanCode);
            } else {
              // If first attempt fails, try a second pass with a rotated image
              // (some cameras rotate images) — attempt rotation fallback
              try {
                const img = new Image();
                img.onload = () => {
                  const c = document.createElement("canvas");
                  const ctx = c.getContext("2d");
                  c.width = img.height;
                  c.height = img.width;
                  // rotate 90 degrees
                  ctx.translate(c.width / 2, c.height / 2);
                  ctx.rotate((90 * Math.PI) / 180);
                  ctx.drawImage(img, -img.width / 2, -img.height / 2);
                  c.toBlob((rotBlob) => {
                    Quagga.decodeSingle(Object.assign({}, config, { src: URL.createObjectURL(rotBlob) }), (r2) => {
                      if (r2 && r2.codeResult) {
                        const barcode2 = r2.codeResult.code;
                        resolve(barcode2.split(" ")[0]);
                      } else {
                        reject("No barcode detected");
                      }
                    });
                  }, "image/png");
                };
                img.src = URL.createObjectURL(buffer);
              } catch (err) {
                reject("No barcode detected");
              }
            }
          });
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
            // Persist the last used location so it remains in the input
            try { localStorage.setItem("lastLocation", location); } catch (e) { console.warn('Could not save lastLocation', e); }
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
   LEVENSHTEIN DISTANCE (FUZZY MATCHING)
============================= */
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
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

    let results = [];

    // If query contains a space, use fuzzy matching to find the closest match
    if (query.includes(" ")) {
        const cleanQuery = query.split(" ")[0]; // Take the part before the space
        
        // Score all parts by their similarity distance
        const scored = partsData.map(p => ({
            ...p,
            distance: levenshteinDistance(cleanQuery.toLowerCase(), p.code.toLowerCase())
        }));
        
        // Sort by distance (ascending) and take only the closest match
        results = scored
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 1);
    } else {
        // Original: substring matching
        results = partsData.filter(p => 
            p.code.toLowerCase().includes(query)
        );
    }

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

// Handle Enter key to select single result
manualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const suggestions = suggestionsBox.querySelectorAll("div");
        
        // If there's exactly one suggestion, auto-select it
        if (suggestions.length === 1) {
            e.preventDefault();
            const selected = suggestions[0].getAttribute("data-code");
            if (selected) {
                const part = partsData.find(p => p.code === selected);
                if (part) {
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
                }
            }
        }
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