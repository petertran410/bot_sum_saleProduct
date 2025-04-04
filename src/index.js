// src/index.js
require("dotenv").config();
const express = require("express");
const kiotviet = require("./kiotviet");
const lark = require("./lark");
const scheduler = require("./scheduler");
const db = require("../db-mongo.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("KiotViet-Lark Integration Server is running!");
});

app.get("/test-simple-message", async (req, res) => {
  try {
    await lark.sendTestMessage();
    res.status(200).json({ message: "Test message sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/run-report", async (req, res) => {
  try {
    await scheduler.runReportNow();
    res.status(200).json({ message: "Report triggered successfully" });
  } catch (error) {
    console.error("Error triggering report:", error.message);
    res.status(500).json({ error: "Failed to trigger report" });
  }
});

app.get("/check-status", (req, res) => {
  try {
    let lastOrders = [];
    let fileExists = false;

    if (fs.existsSync("./lastOrders.json")) {
      fileExists = true;
      const data = fs.readFileSync("./lastOrders.json", "utf8");
      if (data && data.trim() !== "") {
        lastOrders = JSON.parse(data);
      }
    }

    res.status(200).json({
      status: "OK",
      storagePath: process.cwd(),
      lastDataFileExists: fileExists,
      lastOrdersCount: lastOrders.length,
      lastDataUpdated: fileExists
        ? fs.statSync("./lastOrders.json").mtime
        : null,
      currentTime: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      error: error.message,
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    await db.connectToDatabase();

    scheduler.setupPeriodicCheck();

    console.log("Application initialized successfully!");
  } catch (error) {
    console.error("Error initializing application:", error.message);
  }
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await db.closeConnection();
  process.exit(0);
});
