/* =============================
   MODAL FUNCTIONS
============================== */
let shouldReloadOnClose = false;

function showModal(message, type = "error", reloadAfter = false) {
  const modal = document.getElementById("amcarModal");
  document.getElementById("modalMessage").innerText = message;
  document.getElementById("modalTitle").style.color =
    type === "success" ? "#4bff4b" : "#ff4b4b";
  modal.style.display = "flex";
  
  // Set reload flag
  shouldReloadOnClose = reloadAfter;

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
  document.body.onkeydown = null;
  
  // Only reload if flag is set
  if (shouldReloadOnClose) {
    setTimeout(() => location.reload(), 200);
  }
  
  shouldReloadOnClose = false;
}

/* =============================
   USER SESSION & DISPLAY
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

const savedLastLocation = localStorage.getItem("lastLocation");
if (savedLastLocation) {
  const locInput = document.getElementById("location");
  if (locInput) locInput.value = savedLastLocation;
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("lastPart");
  window.location.href = "login.html";
}

/* =============================
   GLOBAL VARIABLES
============================== */
let partsData = [];
let currentCode = "";
let currentDescription = "";
let currentMMPCPart = "";
let isManual = false;

/* =============================
   LOAD PARTS DATABASE
============================== */
async function loadParts() {
  try {
    const response = await fetch("/api/parts");
    partsData = await response.json();
    console.log("Parts loaded:", partsData.length, "items");
  } catch (error) {
    console.error("Error loading parts:", error);
    showModal("⚠️ Failed to load parts database. Manual entry may not work correctly.");
  }
}
loadParts();

/* =============================
   BARCODE EXTRACTION
============================== */
function extractCode(barcode) {
  const trimmed = barcode.trim();
  const parts = trimmed.split(/\s+/);
  return parts[0];
}

/* =============================
   LEVENSHTEIN DISTANCE (FUZZY MATCHING)
============================== */
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
   IMAGE PREPROCESSING FUNCTIONS
============================== */
async function preprocessImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const TARGET_SIZE = 1920;
  const scale = Math.min(
    TARGET_SIZE / Math.max(img.width, img.height),
    2.5
  );

  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const brightness = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
      histogram[brightness]++;
    }

    const totalPixels = data.length / 4;
    let cumulative = 0;
    let darkPoint = 0;
    let brightPoint = 255;

    for (let i = 0; i < 256; i++) {
      cumulative += histogram[i];
      if (cumulative > totalPixels * 0.05 && darkPoint === 0) {
        darkPoint = i;
      }
      if (cumulative > totalPixels * 0.95 && brightPoint === 255) {
        brightPoint = i;
        break;
      }
    }

    const range = brightPoint - darkPoint;
    if (range > 0) {
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let v = data[i + c];
          v = ((v - darkPoint) / range) * 255;
          v = Math.pow(v / 255, 0.9) * 255;
          data[i + c] = Math.max(0, Math.min(255, v));
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  } catch (err) {
    console.warn("Preprocessing warning:", err);
  }

  return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

async function preprocessGrayscale(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const TARGET_SIZE = 1920;
  const scale = Math.min(TARGET_SIZE / Math.max(img.width, img.height), 2.5);

  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

async function invertImage(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const TARGET_SIZE = 1920;
  const scale = Math.min(TARGET_SIZE / Math.max(img.width, img.height), 2.5);

  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }

  ctx.putImageData(imageData, 0, 0);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

/* =============================
   BARCODE DECODING
============================== */
function decodeImage(buffer) {
  return new Promise((resolve, reject) => {
    const configs = [
      {
        src: URL.createObjectURL(buffer),
        numOfWorkers: 0,
        locate: true,
        inputStream: { size: 1920, singleChannel: false },
        locator: { patchSize: "large", halfSample: false },
        decoder: { readers: ["code_128_reader"], multiple: false }
      },
      {
        src: URL.createObjectURL(buffer),
        numOfWorkers: 0,
        locate: true,
        inputStream: { size: 1920, singleChannel: false },
        locator: { patchSize: "large", halfSample: false },
        decoder: { readers: ["code_39_reader", "code_39_vin_reader"], multiple: false }
      },
      {
        src: URL.createObjectURL(buffer),
        numOfWorkers: 0,
        locate: true,
        inputStream: { size: 1600, singleChannel: false },
        locator: { patchSize: "medium", halfSample: false },
        decoder: {
          readers: ["code_128_reader", "code_39_reader", "code_93_reader", "ean_reader", "upc_reader", "codabar_reader"],
          multiple: false
        }
      },
      {
        src: URL.createObjectURL(buffer),
        numOfWorkers: 0,
        locate: true,
        inputStream: { size: 1200, singleChannel: false },
        locator: { patchSize: "medium", halfSample: true },
        decoder: { readers: ["code_128_reader", "code_39_reader", "ean_reader"], multiple: false }
      }
    ];

    let configIndex = 0;
    let attempts = [];

    function tryNextConfig() {
      if (configIndex >= configs.length) {
        console.log("All configs failed. Attempts:", attempts);
        reject(new Error("No barcode detected with any configuration"));
        return;
      }

      const config = configs[configIndex];
      const configName = `Config ${configIndex + 1}`;
      configIndex++;

      Quagga.decodeSingle(config, (result) => {
        if (result && result.codeResult && result.codeResult.code) {
          const barcode = result.codeResult.code.trim();
          const cleanCode = barcode.replace(/^[\s#*-]+|[\s#*-]+$/g, '');

          if (cleanCode.length > 0 && result.codeResult.decodedCodes) {
            const avgError = result.codeResult.decodedCodes.reduce((sum, code) => {
              return sum + (code.error || 0);
            }, 0) / result.codeResult.decodedCodes.length;

            console.log(`${configName} detected:`, cleanCode, `(avg error: ${avgError.toFixed(2)})`);

            if (avgError < 0.15) {
              resolve(cleanCode);
              return;
            } else {
              attempts.push({ config: configName, code: cleanCode, error: avgError });
            }
          }
        }
        tryNextConfig();
      });
    }

    tryNextConfig();
  });
}

async function decodeImageWithFallbacks(file) {
  console.log("Starting barcode decode with multiple strategies...");

  // Strategy 1: Original image
  try {
    console.log("Trying original image...");
    const result = await decodeImage(file);
    if (result && result.trim()) {
      console.log("✓ Success with original image");
      return result.trim();
    }
  } catch (error) {
    console.log("Original image failed:", error.message);
  }

  // Strategy 2: Enhanced contrast
  try {
    console.log("Trying enhanced contrast...");
    const enhanced = await preprocessImage(file);
    const result = await decodeImage(enhanced);
    if (result && result.trim()) {
      console.log("✓ Success with enhanced image");
      return result.trim();
    }
  } catch (error) {
    console.log("Enhanced image failed:", error.message);
  }

  // Strategy 3: Grayscale
  try {
    console.log("Trying grayscale conversion...");
    const grayscale = await preprocessGrayscale(file);
    const result = await decodeImage(grayscale);
    if (result && result.trim()) {
      console.log("✓ Success with grayscale");
      return result.trim();
    }
  } catch (error) {
    console.log("Grayscale failed:", error.message);
  }

  // Strategy 4: Inverted image
  try {
    console.log("Trying inverted image...");
    const inverted = await invertImage(file);
    const result = await decodeImage(inverted);
    if (result && result.trim()) {
      console.log("✓ Success with inverted image");
      return result.trim();
    }
  } catch (error) {
    console.log("Inverted image failed:", error.message);
  }

  throw new Error("Could not decode barcode with any strategy");
}

/* =============================
   IMAGE UPLOAD HANDLER
============================== */
document.getElementById("barcodeInput").addEventListener("change", handleImageUpload);

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById("preview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";

  showModal("🔍 Scanning barcode...", "success", false);

  try {
    const barcode = await decodeImageWithFallbacks(file);
    const extractedCode = extractCode(barcode);
    
    document.getElementById("decodedText").textContent = barcode;
    document.getElementById("codeField").textContent = extractedCode;

    // Find best match using fuzzy matching
    let bestMatch = null;
    let minDistance = Infinity;
    
    partsData.forEach(p => {
      const dist = levenshteinDistance(extractedCode.toLowerCase(), p.code.toLowerCase());
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = p;
      }
    });

    if (!bestMatch || minDistance > 2) {
      showModal("❌ No matching part code found in database.", "error", false);
      return;
    }

    document.getElementById("description").textContent = bestMatch.description;
    document.getElementById("mmpcField").textContent = bestMatch.mmpcPart || "No";

    currentCode = bestMatch.code;
    currentDescription = bestMatch.description || "";
    currentMMPCPart = bestMatch.mmpcPart || "No";
    isManual = false;

    document.getElementById("resultBox").style.display = "block";
    document.getElementById("formBox").style.display = "block";

    // Close modal automatically after successful scan without reloading
    closeModal();
  } catch (error) {
    showModal("❌ Barcode could not be read. Try again or use manual entry.", "error", false);
    console.error("Barcode decoding failed:", error);
  }
}

/* =============================
   FORM SUBMISSION
============================== */
async function submitForm() {
  const quantity = document.getElementById("quantity").value.trim();
  const location = document.getElementById("location").value.trim();

  if (!quantity) {
    showModal("❌ Quantity is required.", "error", false);
    return;
  }
  if (!location) {
    showModal("❌ Location is required.", "error", false);
    return;
  }

  const user = localStorage.getItem("user");

  const payload = {
    code: currentCode,
    description: currentDescription,
    quantity: quantity,
    location: location,
    encodedBy: user,
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
      localStorage.setItem("lastPart", currentCode);
      document.getElementById("lastPartDisplay").textContent = currentCode;
      
      try { 
        localStorage.setItem("lastLocation", location); 
      } catch (e) { 
        console.warn('Could not save lastLocation', e); 
      }
      
      // Reload after successful save
      showModal("✅ Scan saved successfully!", "success", true);
    } else {
      showModal("❌ Error: " + (data.message || "Failed to save"), "error", false);
    }
  } catch (err) {
    showModal("❌ Server error: " + err.message, "error", false);
    console.error("Submit error:", err);
  }
}

/* =============================
   CSV DOWNLOAD
============================== */
async function downloadCSV() {
  try {
    const response = await fetch("/api/export-csv");

    if (!response.ok) {
      showModal("❌ Failed to download CSV.", "error", false);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showModal("❌ Download failed.", "error", false);
    console.error(error);
  }
}

/* =============================
   MANUAL ENTRY LIVE SEARCH
============================== */
const manualInput = document.getElementById("manualCodeInput");
const suggestionsBox = document.getElementById("suggestionsBox");

manualInput.addEventListener("input", () => {
  const query = manualInput.value.trim().toLowerCase();

  if (!query) {
    suggestionsBox.style.display = "none";
    return;
  }

  let results = [];

  if (query.includes(" ")) {
    const cleanQuery = query.split(" ")[0];
    const scored = partsData.map(p => ({
      ...p,
      distance: levenshteinDistance(cleanQuery.toLowerCase(), p.code.toLowerCase())
    }));
    results = scored.sort((a, b) => a.distance - b.distance).slice(0, 1);
  } else {
    results = partsData.filter(p => p.code.toLowerCase().includes(query));
  }

  if (results.length > 0) {
    suggestionsBox.innerHTML = results
      .map(r => `<div data-code="${r.code}">${r.code} — ${r.description}</div>`)
      .join("");
    suggestionsBox.style.display = "block";
  } else {
    suggestionsBox.style.display = "none";
  }
});

manualInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const suggestions = suggestionsBox.querySelectorAll("div");
    
    if (suggestions.length === 1) {
      e.preventDefault();
      const selected = suggestions[0].getAttribute("data-code");
      if (selected) {
        selectManualPart(selected);
      }
    }
  }
});

suggestionsBox.addEventListener("click", (e) => {
  const selected = e.target.getAttribute("data-code");
  if (selected) {
    selectManualPart(selected);
  }
});

function selectManualPart(code) {
  const part = partsData.find(p => p.code === code);
  if (!part) return;

  currentCode = part.code;
  currentDescription = part.description;
  currentMMPCPart = part.mmpcPart || "No";
  isManual = true;

  manualInput.value = part.code;

  document.getElementById("decodedText").textContent = part.code;
  document.getElementById("codeField").textContent = part.code;
  document.getElementById("description").textContent = part.description;
  document.getElementById("mmpcField").textContent = currentMMPCPart;

  document.getElementById("resultBox").style.display = "block";
  document.getElementById("formBox").style.display = "block";
  document.getElementById("preview").style.display = "none";

  suggestionsBox.style.display = "none";
}