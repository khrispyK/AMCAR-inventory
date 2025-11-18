const codeReader = new ZXing.BrowserBarcodeReader();
const video = document.getElementById("preview");

let scannedBarcode = "";
let scannedDescription = "";

async function startScanner() {
  const devices = await codeReader.getVideoInputDevices();

  codeReader.decodeFromVideoDevice(devices[0].deviceId, video, async (result, err) => {
    if (result) {
      scannedBarcode = result.text;
      document.getElementById("barcode").innerText = scannedBarcode;

      // lookup description
      const res = await fetch(`/description/${scannedBarcode}`);
      const data = await res.json();

      if (data.found) {
        scannedDescription = data.description;
        document.getElementById("desc").innerText = data.description;
      } else {
        scannedDescription = "";
        document.getElementById("desc").innerText = "NOT FOUND";
      }
    }
  });
}

startScanner();

async function submitScan() {
  const quantity = document.getElementById("qty").value;
  const location = document.getElementById("loc").value;

  if (!scannedBarcode || !quantity || !location) {
    document.getElementById("msg").innerText = "Missing fields.";
    return;
  }

  const res = await fetch("/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      barcode: scannedBarcode,
      description: scannedDescription,
      quantity,
      location
    })
  });

  const data = await res.json();

  if (data.success) {
    document.getElementById("msg").innerText = "Saved! Scan next...";
    document.getElementById("qty").value = "";
    document.getElementById("loc").value = "";
  }
}
