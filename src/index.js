require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
} = require("./syncKiot/syncKiot");
const { getProducts } = require("./kiotviet");
const { getCustomers } = require("./kiotviet");
const { testConnection } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("KiotViet API Sync Server");
});

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
    res.json({
      success: true,
      message: "Product synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during product synchronization",
      error: error.message,
    });
  }
});

app.get("/save-customer", async (req, res) => {
  try {
    const saveCustomer = await runCustomerSync();
    res.json(saveCustomer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during customer synchronization",
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
    res.status(500).json({
      success: false,
      message: "Error fetching products",
      error: error.message,
    });
  }
});

app.get("/get-customers", async (req, res) => {
  try {
    const customers = await getCustomers();
    res.json(customers);
  } catch (error) {
    console.log("Cannot get customers", error);
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
});

// Initialize and start the server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error(
        "Failed to connect to database. Please check your database configuration."
      );
      process.exit(1);
    }

    const server = app.listen(PORT, async () => {
      const historicalDaysAgo = parseInt(process.env.INITIAL_SCAN_DAYS || "7");

      const orderSyncStatus =
        await require("../src/db/orderService").getSyncStatus();
      const invoiceSyncStatus =
        await require("../src/db/invoiceService").getSyncStatus();
      const customerSyncStatus =
        await require("../src/db/customerService").getSyncStatus();
      const productSyncStatus =
        await require("../src/db/productService").getSyncStatus();

      if (!orderSyncStatus.historicalCompleted) {
        console.log(
          `Syncing ${historicalDaysAgo} days of historical order data...`
        );
        await require("../scheduler/orderScheduler").orderScheduler(
          historicalDaysAgo
        );
      }

      if (!invoiceSyncStatus.historicalCompleted) {
        console.log(
          `Syncing ${historicalDaysAgo} days of historical invoice data...`
        );
        await require("../scheduler/invoiceScheduler").invoiceScheduler(
          historicalDaysAgo
        );
      }

      if (!customerSyncStatus.historicalCompleted) {
        console.log(
          `Syncing ${historicalDaysAgo} days of historical customer data...`
        );
        await require("../scheduler/customerScheduler").customerScheduler(
          historicalDaysAgo
        );
      }

      if (!productSyncStatus.historicalCompleted) {
        console.log(
          `Syncing ${historicalDaysAgo} days of historical product data...`
        );
        await require("../scheduler/productScheduler").productScheduler(
          historicalDaysAgo
        );
      }

      // Now run the current data sync
      await runOrderSync();
      await runInvoiceSync();
      await runCustomerSync();
      await runProductSync();

      const runBothSyncs = async () => {
        try {
          await Promise.all([
            runOrderSync(),
            runInvoiceSync(),
            runCustomerSync(),
            runProductSync(),
          ]);
        } catch (error) {
          console.error("Error during simultaneous sync:", error);
        }
      };

      // Run sync every 3 minutes (3 * 60 * 1000 ms)
      const syncInterval = setInterval(runBothSyncs, 3 * 60 * 1000);

      process.on("SIGINT", () => {
        clearInterval(syncInterval);
        server.close(() => {
          console.log("Server stopped");
          process.exit(0);
        });
      });
    });

    return server;
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();
