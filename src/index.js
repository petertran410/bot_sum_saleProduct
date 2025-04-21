require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const kiotviet = require("./kiotviet");
const scheduler = require("./scheduler");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/get-orders", async (req, res) => {
  try {
    const getOrders = await kiotviet.getOrders();
    res.json(getOrders);
  } catch (error) {
    console.log("Cannot get orders", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/get-invoices", async (req, res) => {
  try {
    const getInvoices = await kiotviet.getInvoices();
    res.json(getInvoices);
  } catch (error) {
    console.log("Cannot get invoices", error);
  }
});

app.get("/stored-orders", (req, res) => {
  try {
    const ordersFilePath = path.join(__dirname, "orders.json");
    if (fs.existsSync(ordersFilePath)) {
      const ordersData = fs.readFileSync(ordersFilePath, "utf8");
      res.json(JSON.parse(ordersData));
    } else {
      res.json({ orders: [], total: 0, lastUpdated: null });
    }
  } catch (error) {
    console.error("Error reading stored orders:", error);
    res.status(500).json({ error: "Failed to read stored orders" });
  }
});

app.get("/scan-orders/:days", async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 30;
    res.json({ message: `Started scanning orders for the last ${days} days` });

    scheduler.scanOrdersForDays(days);
  } catch (error) {
    console.error("Error triggering order scan:", error);
    res.status(500).json({ error: "Failed to trigger order scan" });
  }
});

app.get("/stored-invoices", (req, res) => {
  try {
    const invoicesFilePath = path.join(__dirname, "invoices.json");
    if (fs.existsSync(invoicesFilePath)) {
      const invoicesData = fs.readFileSync(invoicesFilePath, "utf8");
      res.json(JSON.parse(invoicesData));
    } else {
      res.json({ invoices: [], total: 0, lastUpdated: null });
    }
  } catch (error) {
    console.error("Error reading stored invoices:", error);
    res.status(500).json({ error: "Failed to read stored invoices" });
  }
});

app.get("/scan-invoices/:days", async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 30;
    res.json({
      message: `Started scanning invoices for the last ${days} days`,
    });

    scheduler.scanInvoicesForDays(days);
  } catch (error) {
    console.error("Error triggering invoices scan:", error);
    res.status(500).json({ error: "Failed to trigger invoice scan" });
  }
});

app.get("/get-products", async (req, res) => {
  try {
    const getProducts = await kiotviet.getProducts();
    res.json(getProducts);
  } catch (error) {
    console.error("Cannot get products", error);
    res.status(500).json({
      error: "Failed to fetch products",
    });
  }
});

app.get("/convert-to-excel", (req, res) => {
  try {
    const result = scheduler.convertAllToExcel();
    res.json({
      message: "Conversion to Excel started",
      result: result,
    });
  } catch (error) {
    console.error("Error triggering Excel conversion:", error);
    res.status(500).json({ error: "Failed to convert to Excel" });
  }
});

// Khởi động server
app.listen(PORT, () => {
  scheduler.startScheduler(15, 1);
  // scheduler.scheduleExcelConversion(60);
});
