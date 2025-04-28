require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
} = require("../src/syncKiot/syncKiot");
const { getProducts } = require("./kiotviet");

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

app.get("/save-product", async (req, res) => {
  try {
    await runProductSync();
    res.join({
      success: true,
      message: "Product synchronization completed",
    });
  } catch (error) {
    res.status(500).join({
      success: false,
      message: "Error during product synchronization",
      error: error.message,
    });
  }
});

app.get("/get-products", async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (error) {
    console.log("Cannot get products", error);
    throw error;
  }
});

const server = app.listen(PORT, async () => {
  await runOrderSync();
  await runInvoiceSync();
  await runProductSync();

  const runBothSyncs = async () => {
    try {
      await Promise.all([runOrderSync(), runInvoiceSync(), runProductSync()]);
      console.log("Order and invoice and product sync completed");
    } catch (error) {
      console.error("Error during simultaneous sync:", error);
    }
  };

  const syncInterval = setInterval(runBothSyncs, 60 * 3000);

  process.on("SIGINT", () => {
    clearInterval(syncInterval);
    server.close(() => {
      console.log("Server stopped");
      process.exit(0);
    });
  });
});
