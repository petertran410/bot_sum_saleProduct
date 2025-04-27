require("dotenv").config();
const express = require("express");

const { runOrderSync, runInvoiceSync } = require("../src/syncKiot/syncKiot");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {});

app.get("/save-order", async (req, res) => {
  try {
    await runOrderSync();
    res.json({
      success: true,
      message: "Order synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during order synchronization",
      error: error.message,
    });
  }
});

app.get("/save-invoice", async (req, res) => {
  try {
    await runInvoiceSync();
    res.json({
      success: true,
      message: "Invoice synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during invoice synchronization",
      error: error.message,
    });
  }
});

const server = app.listen(PORT, async () => {
  await runOrderSync();
  await runInvoiceSync();

  const runBothSyncs = async () => {
    try {
      await Promise.all([runOrderSync(), runInvoiceSync()]);
      console.log("Both order and invoice sync completed");
    } catch (error) {
      console.error("Error during simultaneous sync:", error);
    }
  };

  const syncInterval = setInterval(runBothSyncs, 60 * 5000);

  process.on("SIGINT", () => {
    clearInterval(syncInterval);
    server.close(() => {
      console.log("Server stopped");
      process.exit(0);
    });
  });
});
