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
const usersPath = path.join(__dirname, "db", "users.json");

// Ensure DB files exist
await fs.ensureFile(scansPath);
await fs.ensureFile(partsPath);
await fs.ensureFile(usersPath);

if (!(await fs.readFile(scansPath, "utf8"))) {
    await fs.writeJson(scansPath, []);
}
if (!(await fs.readFile(partsPath, "utf8"))) {
    await fs.writeJson(partsPath, []);
}
if (!(await fs.readFile(usersPath, "utf8"))) {
    await fs.writeJson(usersPath, []);
}

// Load DB into memory
let scans = await fs.readJson(scansPath);
let parts = await fs.readJson(partsPath);
let users = await fs.readJson(usersPath);

// Save function (writes to disk)
async function saveDB() {
    await fs.writeJson(scansPath, scans, { spaces: 2 });
    await fs.writeJson(partsPath, parts, { spaces: 2 });
}

/* =============================
   API ENDPOINTS
============================== */

// Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if (user) {
        return res.json({ 
            success: true, 
            user: { 
                username: user.username, 
                role: user.role || "USER" 
            } 
        });
    } else {
        return res.json({ success: false });
    }
});

// Save scan
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
        reason: reason || "",
        manual: manual === true,
        timestamp: new Date().toISOString()
    };

    scans.push(entry);
    await saveDB();

    return res.json({ success: true });
});

// Get all scans
app.get("/api/scans", (req, res) => {
    res.json(scans);
});

// Get parts database
app.get("/api/parts", (req, res) => {
    res.json(parts);
});

// Lookup single part by code
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

// Update scan entry
app.put("/api/scans/:index", async (req, res) => {
    const index = Number(req.params.index);
    if (index < 0 || index >= scans.length) {
        return res.status(400).json({ success: false, message: "Invalid index" });
    }

    scans[index] = {
        ...scans[index],
        ...req.body,
    };

    await saveDB();
    res.json({ success: true });
});

// Delete scan entry
app.delete("/api/scans/:index", async (req, res) => {
    const index = Number(req.params.index);

    if (index < 0 || index >= scans.length) {
        return res.status(400).json({ success: false, message: "Invalid index" });
    }

    scans.splice(index, 1);
    await saveDB();

    res.json({ success: true });
});

// CSV export
app.get("/api/export-csv", async (req, res) => {
    const scans = await fs.readJson(scansPath);

    if (!scans.length) {
        return res.status(400).send("No scans to export.");
    }

    // CSV headers
    let csv = "Code,Description,Quantity,Location,MMPC Part,Reason,Timestamp,Encoded By,Manual\n";

    scans.forEach(s => {
        const escapeCsv = (val) => {
            if (!val) return "";
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        csv += `${escapeCsv(s.code)},${escapeCsv(s.description)},${s.quantity},${escapeCsv(s.location)},${escapeCsv(s.mmpcPart)},${escapeCsv(s.reason)},${s.timestamp},${escapeCsv(s.encodedBy)},${s.manual ? "Yes" : "No"}\n`;
    });

    res.setHeader("Content-disposition", "attachment; filename=inventory_export.csv");
    res.set("Content-Type", "text/csv");
    res.status(200).send(csv);
});

/* =============================
   SERVE FRONTEND
============================== */
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.use(express.static(path.join(__dirname, "public")));

/* =============================
   START SERVER
============================== */
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 AMCAR Inventory System running on http://localhost:${PORT}`));