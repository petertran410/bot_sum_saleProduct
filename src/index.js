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
  runTrademarkSync,
  runAttributeSync,
  runProductOnHandsSync,
  runBranchSync,
  runPricebookSync,
} = require("./syncKiot/syncKiot");
const { testConnection } = require("./db");
const { initializeDatabase } = require("./db/init");
const { addRecordToCRMBase, getCRMStats, sendTestMessage } = require("./lark");

const app = express();
const PORT = process.env.PORT || 3000;

let server;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  req.clientIP =
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    (req.connection?.socket ? req.connection.socket.remoteAddress : null);
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
    message:
      "KiotViet API Sync Server with CRM Integration & Lark Customer Sync",
    endpoints: {
      health: "/api/health",
      registration: "/api/submit-registration",
      stats: "/api/crm/stats",
      test: "/api/test-lark",
      syncSaleChannels: "POST /api/sync/salechannels",
      saleChannelStatus: "GET /api/sync/salechannels/status",
      syncTrademarks: "POST /api/sync/trademarks",
      trademarkStatus: "GET /api/sync/trademarks/status",
      syncCustomerLark: "POST /api/sync/customer-lark",
      customerLarkStatus: "GET /api/sync/customer-lark/status",
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
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

async function startServer() {
  try {
    const dbConnected = await testConnection();

    if (!dbConnected) {
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

        // ✅ NEW: Add customer Lark sync status check
        const customerLarkSyncStatus = await getSyncStatusSafely(
          "../src/db/customerLarkService",
          "customer_lark"
        );

        console.log("📊 Sync Status Summary:");
        console.log(
          `   Users: Historical ${
            userSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${userSyncStatus.lastSync || "Never"}`
        );
        console.log(
          `   Customers: Historical ${
            customerSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${customerSyncStatus.lastSync || "Never"}`
        );
        console.log(
          `   Products: Historical ${
            productSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${productSyncStatus.lastSync || "Never"}`
        );
        console.log(
          `   Orders: Historical ${
            orderSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${orderSyncStatus.lastSync || "Never"}`
        );
        // ✅ NEW: Add customer Lark status
        console.log(
          `   Customer→Lark: Historical ${
            customerLarkSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${customerLarkSyncStatus.lastSync || "Never"}`
        );

        if (!userSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const { saveUsersByDate } = require("./db/userService");
            return saveUsersByDate(historicalDaysAgo);
          }, "Users Historical");
        }

        if (!customerSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const { saveCustomersByDate } = require("./db/customerService");
            return saveCustomersByDate(historicalDaysAgo);
          }, "Customers Historical");
        }

        if (!productSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const { saveProductsByDate } = require("./db/productService");
            return saveProductsByDate(historicalDaysAgo);
          }, "Products Historical");
        }

        if (!orderSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const { saveOrdersByDate } = require("./db/orderService");
            return saveOrdersByDate(historicalDaysAgo);
          }, "Orders Historical");
        }

        // ✅ NEW: Customer Lark historical sync
        if (!customerLarkSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const {
              saveSyncByDateCustomerIntoLark,
            } = require("./db/customerLarkService");
            return saveSyncByDateCustomerIntoLark();
          }, "Customer→Lark Historical");
        }

        const syncIntervalSeconds = parseInt(
          process.env.SCAN_INTERVAL_SECONDS || "15"
        );

        setInterval(async () => {
          try {
            console.log("🔄 Starting sync operations...");

            const currentUserSyncStatus = await getSyncStatusSafely(
              "../src/db/userService",
              "users"
            );
            const currentCustomerSyncStatus = await getSyncStatusSafely(
              "../src/db/customerService",
              "customers"
            );
            const currentProductSyncStatus = await getSyncStatusSafely(
              "../src/db/productService",
              "products"
            );
            const currentOrderSyncStatus = await getSyncStatusSafely(
              "../src/db/orderService",
              "orders"
            );

            // ✅ NEW: Get current customer Lark sync status
            const currentCustomerLarkSyncStatus = await getSyncStatusSafely(
              "../src/db/customerLarkService",
              "customer_lark"
            );

            if (currentUserSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveUsers } = require("./db/userService");
                return saveUsers();
              }, "Users Current");
            }

            if (currentCustomerSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveCustomers } = require("./db/customerService");
                return saveCustomers();
              }, "Customers Current");
            }

            if (currentProductSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveProducts } = require("./db/productService");
                return saveProducts();
              }, "Products Current");
            }

            if (currentOrderSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveOrders } = require("./db/orderService");
                return saveOrders();
              }, "Orders Current");
            }

            // ✅ NEW: Customer Lark current sync
            if (currentCustomerLarkSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const {
                  saveSyncCustomerIntoLark,
                } = require("./db/customerLarkService");
                return saveSyncCustomerIntoLark(2); // 2 days back for current sync
              }, "Customer→Lark Current");
            }
          } catch (error) {
            console.error("❌ Error in sync interval:", error.message);
          }
        }, syncIntervalSeconds * 1000);

        console.log(
          `⏰ Sync operations will run every ${syncIntervalSeconds} seconds`
        );
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(
          `📋 Registration: http://localhost:${PORT}/api/submit-registration`
        );
      } catch (error) {
        console.error("❌ Server startup error:", error);
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received. Shutting down gracefully...");
  if (server) {
    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received. Shutting down gracefully...");
  if (server) {
    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

startServer();
