document.getElementById("barcodeInput").addEventListener("change", handleImageUpload);

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // preview image
    const preview = document.getElementById("preview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";

    // Downscale & preprocess
    const processedBlob = await preprocessImage(file);

    // FIXED: correct function name
    let barcode;
    try {
        barcode = await decodeImage(processedBlob);
    } catch (err) {
        alert("❌ Barcode could not be read.");
        console.log(err);
        return;
    }

    // show UI
    document.getElementById("decodedText").textContent = barcode;
    document.getElementById("codeField").textContent = barcode;
    // document.getElementById("description").textContent = partsData.find(p => p.code === barcode).description;

    const part = partsData.find(p => p.code === barcode);

if (!part) {
    alert("❌ Unknown part code — not in database.");
    location.reload();
    return;
}

document.getElementById("description").textContent = part.description;
    document.getElementById("resultBox").style.display = "block";
    document.getElementById("formBox").style.display = "block";
    
}

async function preprocessImage(file) {
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // downscale to 800px max
    const MAX = 800;
    const scale = Math.min(MAX / img.width, MAX / img.height);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

function decodeImage(buffer) {
    return new Promise((resolve, reject) => {
        Quagga.decodeSingle({
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
                    "upc_reader"
                ]
            }
        }, result => {
            if (result && result.codeResult) {
                resolve(result.codeResult.code);
            } else {
                reject("No barcode detected");
            }
        });
    });
}

async function submitForm() {
    const user = localStorage.getItem("user");

    const data = {
        code: document.getElementById("decodedText").textContent,
        description: document.getElementById("description").textContent,
        quantity: document.getElementById("quantity").value,
        location: document.getElementById("location").value,
        encodedBy: user
    };

    const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    const result = await res.json();

    if (result.success) {
        alert("✅ Saved to local database!");
        location.reload();
    } else {
        alert("❌ Error saving.");
    }
}

function downloadCSV() {
    window.location.href = "/api/export-csv";
}

let partsData = [];

// Load parts.json
async function loadParts() {
  try {
    const response = await fetch("/api/parts");

    partsData = await response.json();
    console.log("Parts loaded:", partsData);
  } catch (error) {
    console.error("Error loading parts.json:", error);
  }
}

loadParts();

function updateDescriptionFromCode(code) {
    const descDisplay = document.getElementById("description");

    if (!partsData.length) {
        descDisplay.textContent = "Parts not loaded yet";
        return;
    }

    const part = partsData.find(p => p.code === code);

    if (part) {
        descDisplay.textContent = part.description;
    } else {
        // Unknown code → show popup and reload
        alert("❌ Unknown part code — not in database.");
        location.reload();
    }
}


// document.getElementById("code").addEventListener("change", (e) => {
//   updateDescriptionFromCode(e.target.value.trim());
// });

function useManualCode() {
    const manualCode = document.getElementById("manualCodeInput").value.trim();
    if (!manualCode) {
        alert("Please enter a part code.");
        return;
    }

    // Set UI values
    document.getElementById("decodedText").textContent = manualCode;
    document.getElementById("codeField").textContent = manualCode;

    // Update description via parts.json
    updateDescriptionFromCode(manualCode);

    // Show result and form
    document.getElementById("resultBox").style.display = "block";
    document.getElementById("formBox").style.display = "block";

    // Clear preview + scanner result
    document.getElementById("preview").style.display = "none";
}
