// Fix for src/index.js - Prevent EventEmitter memory leak

require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  runSurchargeSync,
  runCashflowSync,
  runPurchaseOrderSync,
  runTransferSync,
  runSaleChannelSync,
  runReturnSync,
  runOrderSupplierSync,
  runLocationSync,
} = require("./syncKiot/syncKiot");
const { testConnection } = require("./db");
const { initializeDatabase } = require("./db/init");
const { addRecordToCRMBase, getCRMStats, sendTestMessage } = require("./lark");

const app = express();
const PORT = process.env.PORT || 3690;

// Fix 1: Increase max listeners to prevent warning
process.setMaxListeners(20);

// Fix 2: Global variables for cleanup
let syncInterval = null;
let server = null;

// Fix 3: Cleanup function
function cleanup() {
  console.log("🛑 Cleaning up resources...");

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (server) {
    server.close(() => {
      console.log("🛑 Server stopped");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Fix 4: Add process listeners ONCE at module level (not inside app.listen)
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  cleanup();
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  cleanup();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.clientIP =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null);
  next();
});

app.use((req, res, next) => {
  const allowedOrigins = [
    "https://www.traphuonghoang.com",
    "https://traphuonghoang.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "file://",
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "KiotViet API Sync Server with CRM Integration",
    endpoints: {
      health: "/api/health",
      registration: "/api/submit-registration",
      stats: "/api/crm/stats",
      test: "/api/test-lark",
      syncSaleChannels: "POST /api/sync/salechannels",
      saleChannelStatus: "GET /api/sync/salechannels/status",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    services: {
      database: "Connected",
      larkSuite: "Available",
      crm: "Ready",
    },
    version: "1.0.0",
  });
});

app.post("/api/submit-registration", async (req, res) => {
  try {
    const { name, phone, email, type, ticket, city } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phone, email",
        code: "MISSING_FIELDS",
      });
    }

    const formDataWithIP = {
      ...req.body,
      clientIP: req.clientIP,
      userAgent: req.get("User-Agent"),
    };

    const result = await addRecordToCRMBase(formDataWithIP);

    if (result.success) {
      res.json({
        success: true,
        message: "Registration submitted successfully",
        data: {
          record_id: result.record_id,
          stt: result.stt,
          status: "Đã lưu vào CRM",
        },
      });
    } else {
      throw new Error("Failed to save to CRM");
    }
  } catch (error) {
    console.error("❌ Registration submission error:", error.message);

    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống, vui lòng thử lại sau",
      code: "INTERNAL_ERROR",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

app.get("/api/crm/stats", async (req, res) => {
  try {
    console.log("📊 CRM stats requested");
    const stats = await getCRMStats();

    if (stats) {
      res.json({
        success: true,
        data: stats,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Could not retrieve CRM statistics",
      });
    }
  } catch (error) {
    console.error("❌ Error getting CRM stats:", error.message);
    res.status(500).json({
      success: false,
      message: "Error retrieving statistics",
      error: error.message,
    });
  }
});

app.get("/api/test-lark", async (req, res) => {
  try {
    console.log("🔧 LarkSuite test requested");
    const result = await sendTestMessage();
    res.json({
      success: true,
      message: "LarkSuite connection test successful",
      data: result,
    });
  } catch (error) {
    console.error("❌ LarkSuite test failed:", error.message);
    res.status(500).json({
      success: false,
      message: "LarkSuite connection test failed",
      error: error.message,
    });
  }
});

app.post("/api/webhook/lark", (req, res) => {
  try {
    console.log("📨 LarkSuite webhook received:", req.body);

    res.json({
      success: true,
      message: "Webhook processed",
    });
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/api/sync/salechannels", async (req, res) => {
  try {
    console.log("🚀 Manual sale channel sync requested");

    // Import the scheduler function
    const {
      salechannelSchedulerCurrent,
    } = require("../scheduler/salechannelScheduler");

    // Execute the sync
    const result = await salechannelSchedulerCurrent();

    if (result.success) {
      console.log(`✅ Manual sale channel sync completed successfully`);

      res.json({
        success: true,
        message: "Sale channels synchronized successfully",
        data: {
          totalProcessed: result.savedCount || 0,
          hasNewData: result.hasNewData || false,
          syncTimestamp: new Date().toISOString(),
          operation: "manual_sync",
        },
      });
    } else {
      console.error(`❌ Manual sale channel sync failed: ${result.error}`);

      res.status(500).json({
        success: false,
        message: "Sale channel synchronization failed",
        error: result.error || "Unknown error occurred",
        operation: "manual_sync",
      });
    }
  } catch (error) {
    console.error("❌ Manual sale channel sync endpoint error:", error.message);
    console.error("Stack trace:", error.stack);

    res.status(500).json({
      success: false,
      message: "Internal server error during sale channel sync",
      error: error.message,
      operation: "manual_sync",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

const initializeStaticData = async () => {
  try {
    console.log("🚀 Initializing static data...");

    await runLocationSync();

    console.log("✅ Static data initialization completed");
  } catch (error) {
    console.error("❌ Static data initialization failed:", error);
  }
};

initializeStaticData();

async function startServer() {
  try {
    const dbConnected = await testConnection();

    if (!dbConnected) {
      process.exit(1);
    }

    const dbInitialized = await initializeDatabase();

    if (!dbInitialized) {
      process.exit(1);
    }

    server = app.listen(PORT, async () => {
      try {
        const historicalDaysAgo = parseInt(
          process.env.INITIAL_SCAN_DAYS || "7"
        );

        const getSyncStatusSafely = async (servicePath, entityName) => {
          try {
            const service = require(servicePath);
            return await service.getSyncStatus();
          } catch (error) {
            console.error(
              `❌ Error getting sync status for ${entityName}:`,
              error.message
            );
            return { historicalCompleted: false, lastSync: null };
          }
        };

        // Helper function to safely run sync operations
        const runSyncSafely = async (syncFunction, entityName) => {
          try {
            console.log(`Starting ${entityName} sync...`);
            await syncFunction();
            console.log(`✅ ${entityName} sync completed`);
          } catch (error) {
            console.error(`❌ ${entityName} sync failed:`, error.message);
            // Don't crash the app, just continue
          }
        };

        const userSyncStatus = await getSyncStatusSafely(
          "../src/db/userService",
          "users"
        );
        const customerSyncStatus = await getSyncStatusSafely(
          "../src/db/customerService",
          "customers"
        );
        const productSyncStatus = await getSyncStatusSafely(
          "../src/db/productService",
          "products"
        );
        const orderSyncStatus = await getSyncStatusSafely(
          "../src/db/orderService",
          "orders"
        );
        const invoiceSyncStatus = await getSyncStatusSafely(
          "../src/db/invoiceService",
          "invoices"
        );
        const surchargeSyncStatus = await getSyncStatusSafely(
          "../src/db/surchagesService",
          "surcharges"
        );
        const cashflowSyncStatus = await getSyncStatusSafely(
          "../src/db/cashflowService",
          "cashflows"
        );
        const purchaseOrderSyncStatus = await getSyncStatusSafely(
          "../src/db/purchaseOrderService",
          "purchase_orders"
        );
        const transferSyncStatus = await getSyncStatusSafely(
          "../src/db/transferService",
          "transfers"
        );
        const returnSyncStatus = await getSyncStatusSafely(
          "../src/db/returnService",
          "returns"
        );

        const orderSupplierSyncStatus = await getSyncStatusSafely(
          "../src/db/orderSupplierService",
          "order_suppliers"
        );

        if (!userSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/userScheduler").userScheduler(
                historicalDaysAgo
              ),
            "historical user"
          );
        }

        if (!productSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/productScheduler").productScheduler(
                historicalDaysAgo
              ),
            "historical product"
          );
        }

        if (!surchargeSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/surchargeScheduler").surchargeScheduler(
                historicalDaysAgo
              ),
            "historical surcharge"
          );
        }

        if (!customerSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/customerScheduler").customerScheduler(
                historicalDaysAgo
              ),
            "historical customer"
          );
        }

        if (!orderSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/orderScheduler").orderScheduler(
                historicalDaysAgo
              ),
            "historical order"
          );
        }

        if (!invoiceSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/invoiceScheduler").invoiceScheduler(
                historicalDaysAgo
              ),
            "historical invoice"
          );
        }

        if (!cashflowSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/cashflowScheduler").cashflowScheduler(
                historicalDaysAgo
              ),
            "historical cashflow"
          );
        }

        if (!purchaseOrderSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/purchaseOrderScheduler").purchaseOrderScheduler(
                historicalDaysAgo
              ),
            "historical purchase order"
          );
        }

        if (!transferSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/transferScheduler").transferScheduler(
                historicalDaysAgo
              ),
            "historical transfer"
          );
        }

        if (!returnSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/returnScheduler").returnScheduler(
                historicalDaysAgo
              ),
            "historical return"
          );
        }

        if (!orderSupplierSyncStatus.historicalCompleted) {
          await runSyncSafely(
            () =>
              require("../scheduler/orderSupplierScheduler").orderSupplierScheduler(
                historicalDaysAgo
              ),
            "historical order supplier"
          );
        }

        // Current sync with error handling
        console.log("🔄 Starting current sync cycle...");
        await runSyncSafely(runUserSync, "current user");
        await runSyncSafely(runProductSync, "current product");
        await runSyncSafely(runSurchargeSync, "current surcharge");
        await runSyncSafely(runCustomerSync, "current customer");
        await runSyncSafely(runPurchaseOrderSync, "current purchase order");
        await runSyncSafely(runOrderSync, "current order");
        await runSyncSafely(runInvoiceSync, "current invoice");
        await runSyncSafely(runCashflowSync, "current cashflow");
        await runSyncSafely(runTransferSync, "current transfer");
        await runSyncSafely(runSaleChannelSync, "current sale channel");
        await runSyncSafely(runReturnSync, "current return");
        await runSyncSafely(runOrderSupplierSync, "current order supplier");

        const runAllSyncs = async () => {
          try {
            await Promise.allSettled([
              runUserSync(),
              runProductSync(),
              runSurchargeSync(),
              runCustomerSync(),
              runPurchaseOrderSync(),
              runOrderSync(),
              runInvoiceSync(),
              runCashflowSync(),
              runTransferSync(),
              runReturnSync(),
              runOrderSupplierSync(),
            ]);
          } catch (error) {
            console.error("❌ Error during scheduled sync:", error.message);
          }
        };

        syncInterval = setInterval(runAllSyncs, 10 * 60 * 1000);

        console.log("🎉 Application startup completed!");

        // Fix 7: Remove the process.on listeners from here since they're now at module level
      } catch (startupError) {
        console.error("❌ Error during startup:", startupError.message);
        console.error("Stack trace:", startupError.stack);
        console.log("⚠️ Server is running but some sync operations failed");
      }
    });

    return server;
  } catch (error) {
    console.error("❌ Error starting server:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

startServer();
