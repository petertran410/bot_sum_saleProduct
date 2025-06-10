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
} = require("./syncKiot/syncKiot");
const { testConnection } = require("./db");
const { initializeDatabase } = require("./db/init");
const { addRecordToCRMBase, getCRMStats, sendTestMessage } = require("./lark");

const app = express();
const PORT = process.env.PORT || 3690;

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
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

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
    },
    timestamp: new Date().toISOString(),
  });
});

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

    const server = app.listen(PORT, async () => {
      try {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📊 Starting KiotViet sync operations...`);

        const historicalDaysAgo = parseInt(
          process.env.INITIAL_SCAN_DAYS || "7"
        );

        // Get sync status for all entities with error handling
        console.log("📋 Checking sync status for all entities...");

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

        const [
          userSyncStatus,
          customerSyncStatus,
          productSyncStatus,
          orderSyncStatus,
          invoiceSyncStatus,
          surchargeSyncStatus,
          cashflowSyncStatus,
          purchaseOrderSyncStatus,
          transferSyncStatus,
        ] = await Promise.allSettled([
          getSyncStatusSafely("../src/db/userService", "users"),
          getSyncStatusSafely("../src/db/customerService", "customers"),
          getSyncStatusSafely("../src/db/productService", "products"),
          getSyncStatusSafely("../src/db/orderService", "orders"),
          getSyncStatusSafely("../src/db/invoiceService", "invoices"),
          getSyncStatusSafely("../src/db/surchagesService", "surcharges"),
          getSyncStatusSafely("../src/db/cashflowService", "cashflows"),
          getSyncStatusSafely(
            "../src/db/purchaseOrderService",
            "purchase_orders"
          ),
          getSyncStatusSafely("../src/db/transferService", "transfers"),
        ]);

        // Helper function to safely run historical sync
        const runHistoricalSyncSafely = async (
          syncFunction,
          entityName,
          daysAgo
        ) => {
          try {
            console.log(`📅 Starting historical ${entityName} sync...`);
            await syncFunction(daysAgo);
            console.log(`✅ Historical ${entityName} sync completed`);
          } catch (error) {
            console.error(
              `❌ Historical ${entityName} sync failed:`,
              error.message
            );
            // Don't crash the app, just log the error and continue
          }
        };

        // Run historical syncs with error handling
        console.log("🔄 Starting historical data synchronization...");

        if (!userSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/userScheduler").userScheduler,
            "user",
            historicalDaysAgo
          );
        }

        if (!productSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/productScheduler").productScheduler,
            "product",
            historicalDaysAgo
          );
        }

        if (!surchargeSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/surchargeScheduler").surchargeScheduler,
            "surcharge",
            historicalDaysAgo
          );
        }

        if (!customerSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/customerScheduler").customerScheduler,
            "customer",
            historicalDaysAgo
          );
        }

        if (!orderSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/orderScheduler").orderScheduler,
            "order",
            historicalDaysAgo
          );
        }

        if (!invoiceSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/invoiceScheduler").invoiceScheduler,
            "invoice",
            historicalDaysAgo
          );
        }

        if (!cashflowSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/cashflowScheduler").cashflowScheduler,
            "cashflow",
            historicalDaysAgo
          );
        }

        if (!purchaseOrderSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/purchaseOrderScheduler")
              .purchaseOrderScheduler,
            "purchase order",
            historicalDaysAgo
          );
        }

        if (!transferSyncStatus.value?.historicalCompleted) {
          await runHistoricalSyncSafely(
            require("../scheduler/transferScheduler").transferScheduler,
            "transfer",
            historicalDaysAgo
          );
        }

        // Current sync (maintain same order) with error handling
        console.log("🔄 Starting current sync cycle...");

        const runSyncSafely = async (syncFunction, entityName) => {
          try {
            await syncFunction();
            console.log(`✅ ${entityName} sync completed`);
          } catch (error) {
            console.error(`❌ ${entityName} sync failed:`, error.message);
          }
        };

        await runSyncSafely(runUserSync, "User");
        await runSyncSafely(runProductSync, "Product");
        await runSyncSafely(runSurchargeSync, "Surcharge");
        await runSyncSafely(runCustomerSync, "Customer");
        await runSyncSafely(runPurchaseOrderSync, "Purchase Order");
        await runSyncSafely(runOrderSync, "Order");
        await runSyncSafely(runInvoiceSync, "Invoice");
        await runSyncSafely(runCashflowSync, "Cashflow");
        await runSyncSafely(runTransferSync, "Transfer");

        console.log("✅ Initial sync cycle completed");

        // Set up recurring sync with error handling
        const runAllSyncs = async () => {
          try {
            console.log("🔄 Running scheduled sync cycle...");
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
            ]);
            console.log("✅ Scheduled sync cycle completed");
          } catch (error) {
            console.error("❌ Error during scheduled sync:", error.message);
            // Don't crash the app, just log the error
          }
        };

        const syncInterval = setInterval(runAllSyncs, 10 * 60 * 1000);

        process.on("SIGINT", () => {
          console.log("🛑 Received SIGINT, shutting down gracefully...");
          clearInterval(syncInterval);
          server.close(() => {
            console.log("🛑 Server stopped");
            process.exit(0);
          });
        });

        console.log("🎉 Application startup completed successfully!");
      } catch (startupError) {
        console.error(
          "❌ Error during application startup:",
          startupError.message
        );
        console.error("Stack trace:", startupError.stack);
        // Don't crash the server, just log the error
        console.log(
          "⚠️ Server is running but sync operations failed to initialize"
        );
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
