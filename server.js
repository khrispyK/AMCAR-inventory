import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";


const app = express();
app.use(cors());
app.use(bodyParser.json());

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to JSON DB
const scansPath = path.join(__dirname, "db", "scans.json");
const partsPath = path.join(__dirname, "db", "parts.json");

// Ensure DB files exist
await fs.ensureFile(scansPath);
await fs.ensureFile(partsPath);

if (!(await fs.readFile(scansPath, "utf8"))) {
    await fs.writeJson(scansPath, []);
}
if (!(await fs.readFile(partsPath, "utf8"))) {
    await fs.writeJson(partsPath, []);
}

// Load DB into memory
let scans = await fs.readJson(scansPath);
let parts = await fs.readJson(partsPath);

// Save function (writes to disk)
async function saveDB() {
    await fs.writeJson(scansPath, scans, { spaces: 2 });
    await fs.writeJson(partsPath, parts, { spaces: 2 });
}

// API endpoint to save scan
app.post("/api/scan", async (req, res) => {
    const { code, description, quantity, location, encodedBy, mmpcPart, reason, manual } = req.body;

    // Only block missing code for SCANNED entries
    if (!manual && !code) {
        return res.json({ success: false, message: "No barcode detected." });
    }


    const entry = {
        code: code || "",
        description: description || "",
        quantity: Number(quantity) || 0,
        location: location || "",
        mmpcPart: mmpcPart || "No",
        encodedBy: encodedBy || "UNKNOWN",
        reason: req.body.reason || "",
        manual: req.body.manual === true,
        timestamp: new Date().toISOString()
    };    

    scans.push(entry);
    await saveDB();

    return res.json({ success: true });
});

// Optional: GET all scans (admin dashboard later)
app.get("/api/scans", (req, res) => {
    res.json(scans);
});

// Optional: GET parts descriptions
app.get("/api/parts", (req, res) => {
    res.json(parts);
});

// CSV export
app.get("/api/export-csv", async (req, res) => {
  const scans = await fs.readJson(scansPath);

  if (!scans.length) {
      return res.status(400).send("No scans to export.");
  }

  // CSV headers
  let csv = "code,description,quantity,location,mmpcPart,reason,timestamp,encodedBy\n";


scans.forEach(s => {
    csv += `${s.code},${s.description || ""},${s.quantity},${s.location},${s.mmpcPart || "No"},${s.reason || ""},${s.timestamp},${s.encodedBy}\n`;
});


  res.setHeader("Content-disposition", "attachment; filename=scanned_parts.csv");
  res.set("Content-Type", "text/csv");
  res.status(200).send(csv);
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
  });  

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`AMCAR MVP running on http://localhost:${PORT}`));

const usersPath = path.join(__dirname, "db", "users.json");
await fs.ensureFile(usersPath);
let users = await fs.readJson(usersPath);

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if (user) {
        return res.json({ success: true, user: user.username });
    } else {
        return res.json({ success: false });
    }
});

app.get("/api/lookup/:code", (req, res) => {
    const code = req.params.code;
    const part = parts.find(p => p.code === code);

    if (!part) {
        return res.json({ found: false });
    }

    res.json({
        found: true,
        description: part.description,
        mmpcPart: part.mmpcPart || "No"
    });
});

app.put("/api/scans/:index", async (req, res) => {
    const index = Number(req.params.index);
    if (index < 0 || index >= scans.length) {
        return res.status(400).json({ success: false, message: "Invalid index" });
    }

    scans[index] = {
        ...scans[index],
        ...req.body,    // overwrite fields with edited ones
    };

    await saveDB();
    res.json({ success: true });
});

app.delete("/api/scans/:index", async (req, res) => {
    const index = Number(req.params.index);

    if (index < 0 || index >= scans.length) {
        return res.status(400).json({ success: false, message: "Invalid index" });
    }

    scans.splice(index, 1);
    await saveDB();

    res.json({ success: true });
});

