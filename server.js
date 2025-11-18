import express from "express";
import fs from "fs";
import csv from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cors());

// -------- LOGIN API --------
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // MVP: hardcoded credentials
  if (username === "admin" && password === "1234") {
    return res.json({ success: true });
  }

  return res.json({ success: false, message: "Invalid credentials" });
});

// -------- LOOKUP PART DESCRIPTION --------
app.get("/description/:barcode", (req, res) => {
  const barcode = req.params.barcode;
  const results = [];

  fs.createReadStream("parts.csv")
    .pipe(csv())
    .on("data", data => results.push(data))
    .on("end", () => {
      const item = results.find(row => row.barcode === barcode);

      if (!item) {
        return res.json({ found: false });
      }

      return res.json({ found: true, description: item.description });
    });
});

// -------- SAVE SCANNED PART --------
app.post("/submit", (req, res) => {
  const { barcode, description, quantity, location } = req.body;

  if (!barcode || !description || !quantity || !location) {
    return res.json({ success: false, message: "Missing fields." });
  }

  const timestamp = new Date().toISOString();

  const csvWriter = createObjectCsvWriter({
    path: "scanned_parts.csv",
    header: [
      { id: "timestamp", title: "timestamp" },
      { id: "barcode", title: "barcode" },
      { id: "description", title: "description" },
      { id: "quantity", title: "quantity" },
      { id: "location", title: "location" }
    ],
    append: true
  });

  csvWriter
    .writeRecords([{ timestamp, barcode, description, quantity, location }])
    .then(() => {
      return res.json({ success: true });
    });
});

// -------- START SERVER --------
const PORT = 3000;
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
