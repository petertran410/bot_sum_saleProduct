require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  runSurchargeSync,
  runCustomerGroupSync,
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
      const historicalDaysAgo = parseInt(process.env.INITIAL_SCAN_DAYS || "7");

      // Get sync status for all entities
      const userSyncStatus =
        await require("../src/db/userService").getSyncStatus();
      const customerGroupSyncStatus =
        await require("../src/db/customerGroupService").getSyncStatus();
      const customerSyncStatus =
        await require("../src/db/customerService").getSyncStatus();
      const productSyncStatus =
        await require("../src/db/productService").getSyncStatus();
      const orderSyncStatus =
        await require("../src/db/orderService").getSyncStatus();
      const invoiceSyncStatus =
        await require("../src/db/invoiceService").getSyncStatus();
      const surchargeSyncStatus =
        await require("../src/db/surchagesService").getSyncStatus();

      if (!userSyncStatus.historicalCompleted) {
        console.log("Starting historical user sync...");
        await require("../scheduler/userScheduler").userScheduler(
          historicalDaysAgo
        );
      }

      if (!productSyncStatus.historicalCompleted) {
        console.log("Starting historical product sync...");
        await require("../scheduler/productScheduler").productScheduler(
          historicalDaysAgo
        );
      }

      if (!surchargeSyncStatus.historicalCompleted) {
        console.log("Starting historical surcharge sync...");
        await require("../scheduler/surchargeScheduler").surchargeScheduler(
          historicalDaysAgo
        );
      }

      if (!customerGroupSyncStatus.historicalCompleted) {
        console.log("Starting historical customer group sync...");
        await require("../scheduler/customerGroupScheduler").customerGroupScheduler(
          historicalDaysAgo
        );
      }

      if (!customerSyncStatus.historicalCompleted) {
        console.log("Starting historical customer sync...");
        await require("../scheduler/customerScheduler").customerScheduler(
          historicalDaysAgo
        );
      }

      if (!orderSyncStatus.historicalCompleted) {
        console.log("Starting historical order sync...");
        await require("../scheduler/orderScheduler").orderScheduler(
          historicalDaysAgo
        );
      }

      if (!invoiceSyncStatus.historicalCompleted) {
        console.log("Starting historical invoice sync...");
        await require("../scheduler/invoiceScheduler").invoiceScheduler(
          historicalDaysAgo
        );
      }

      // Current sync (maintain same order)
      console.log("Starting current sync cycle...");
      await runUserSync();
      await runProductSync();
      await runSurchargeSync();
      await runCustomerGroupSync();
      await runCustomerSync();
      await runOrderSync();
      await runInvoiceSync();

      const runAllSyncs = async () => {
        try {
          // Maintain dependency order in ongoing sync
          await runUserSync();
          await runProductSync();
          await runSurchargeSync();
          await runCustomerGroupSync();
          await runCustomerSync();
          await runOrderSync();
          await runInvoiceSync();
        } catch (error) {
          console.error("Error during simultaneous sync:", error);
        }
      };

      const syncInterval = setInterval(runAllSyncs, 10 * 60 * 1000);

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

startServer();
