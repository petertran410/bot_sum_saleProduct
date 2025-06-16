// File: src/index.js - COMPLETE FILE with Option 1 implemented
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
      // Customer Lark sync endpoints
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

// Customer Lark sync endpoints
app.post("/api/sync/customer-lark", async (req, res) => {
  try {
    console.log("🚀 Manual customer Lark current sync triggered");

    const { syncCustomersToLark } = require("./db/customerLarkService");
    const { getCustomers } = require("./kiotviet");

    // Get current customers and sync to Lark
    const customers = await getCustomers();
    if (customers && customers.data && Array.isArray(customers.data)) {
      const result = await syncCustomersToLark(customers.data);
      res.json({
        success: true,
        message: "Customer Lark sync completed",
        data: result.stats,
      });
    } else {
      res.json({
        success: true,
        message: "No customers to sync",
        data: { total: 0, success: 0, failed: 0 },
      });
    }
  } catch (error) {
    console.error("❌ Manual customer Lark sync failed:", error);
    res.status(500).json({
      success: false,
      message: "Customer Lark sync failed",
      error: error.message,
    });
  }
});

app.get("/api/sync/customer-lark/status", async (req, res) => {
  try {
    const { getSyncStatus } = require("./db/customerLarkService");
    const status = await getSyncStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("❌ Error getting customer Lark sync status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get customer Lark sync status",
      error: error.message,
    });
  }
});

app.post("/api/sync/customer-lark/historical", async (req, res) => {
  try {
    const { daysAgo } = req.body;
    console.log(
      `🚀 Manual customer Lark historical sync triggered for ${daysAgo} days`
    );

    const { saveCustomersByDateToLark } = require("./db/customerLarkService");

    const result = await saveCustomersByDateToLark(daysAgo || 176);

    res.json({
      success: true,
      message: "Customer Lark historical sync completed",
      data: result.stats,
    });
  } catch (error) {
    console.error("❌ Manual customer Lark historical sync failed:", error);
    res.status(500).json({
      success: false,
      message: "Customer Lark historical sync failed",
      error: error.message,
    });
  }
});

app.post("/api/sync/customer-lark/historical-chunked", async (req, res) => {
  try {
    const { daysAgo } = req.body;
    console.log(
      `🚀 Manual customer Lark CHUNKED historical sync triggered for ${daysAgo} days`
    );

    const {
      saveCustomersByDateToLarkChunked,
    } = require("./db/customerLarkService");

    const result = await saveCustomersByDateToLarkChunked(daysAgo || 176);

    res.json({
      success: true,
      message: "Customer Lark chunked historical sync completed",
      data: result.stats,
    });
  } catch (error) {
    console.error("❌ Manual customer Lark chunked sync failed:", error);
    res.status(500).json({
      success: false,
      message: "Customer Lark chunked sync failed",
      error: error.message,
    });
  }
});

const initializeStaticData = async () => {
  try {
    console.log("🚀 Initializing static data...");

    // Add location sync here
    const { runLocationSync } = require("./syncKiot/syncKiot");
    await runLocationSync();

    console.log("✅ Static data initialization completed");
  } catch (error) {
    console.error("❌ Static data initialization failed:", error);
  }
};

// initializeStaticData();

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

        // Customer Lark sync status check
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
        console.log(
          `   Customer→Lark: Historical ${
            customerLarkSyncStatus.historicalCompleted ? "✅" : "❌"
          }, Last: ${customerLarkSyncStatus.lastSync || "Never"}`
        );

        // Historical syncs - run if not completed
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

        // Customer Lark historical sync
        if (!customerLarkSyncStatus.historicalCompleted) {
          await runSyncSafely(() => {
            const {
              saveCustomersByDateToLark,
            } = require("./db/customerLarkService");
            return saveCustomersByDateToLark(historicalDaysAgo);
          }, "Customer→Lark Historical");
        }

        const syncIntervalSeconds = parseInt(
          process.env.SCAN_INTERVAL_SECONDS || "15"
        );

        // ✅ OPTION 1 IMPLEMENTATION: Current sync with customer_lark protection
        setInterval(async () => {
          try {
            console.log("🔄 Starting sync operations...");

            // ✅ CRITICAL CHECK: Get customer_lark status first
            const currentCustomerLarkSyncStatus = await getSyncStatusSafely(
              "../src/db/customerLarkService",
              "customer_lark"
            );

            // ✅ PAUSE ALL CURRENT SYNCS if customer_lark historical is running
            if (!currentCustomerLarkSyncStatus.historicalCompleted) {
              console.log(
                "⏸️ PAUSING all current syncs - Customer→Lark historical sync is running..."
              );
              console.log(
                "📊 Current sync will resume automatically after Customer→Lark historical completes"
              );
              return; // Exit early, skip all current syncs
            }

            // ✅ Only run current syncs if customer_lark historical is completed
            console.log(
              "▶️ Customer→Lark historical completed - Running normal current syncs"
            );

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

            // ✅ FIXED: Current syncs with proper data fetching
            if (currentUserSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const { getUsers } = require("./kiotviet");
                const { saveUsers } = require("./db/userService");
                const users = await getUsers();
                if (users && users.data && Array.isArray(users.data)) {
                  return await saveUsers(users.data);
                }
                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
              }, "Users Current");
            }

            if (currentCustomerSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const { getCustomers } = require("./kiotviet");
                const { saveCustomers } = require("./db/customerService");
                const customers = await getCustomers();
                if (
                  customers &&
                  customers.data &&
                  Array.isArray(customers.data)
                ) {
                  return await saveCustomers(customers.data);
                }
                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
              }, "Customers Current");
            }

            if (currentProductSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const { getProducts } = require("./kiotviet");
                const { saveProducts } = require("./db/productService");
                const products = await getProducts();
                if (products && products.data && Array.isArray(products.data)) {
                  return await saveProducts(products.data);
                }
                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
              }, "Products Current");
            }

            if (currentOrderSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const { getOrders } = require("./kiotviet");
                const { saveOrders } = require("./db/orderService");
                const orders = await getOrders();
                if (orders && orders.data && Array.isArray(orders.data)) {
                  return await saveOrders(orders.data);
                }
                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
              }, "Orders Current");
            }

            // ✅ Customer Lark current sync (only runs after historical is complete)
            if (currentCustomerLarkSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const { getCustomers } = require("./kiotviet");
                const {
                  syncCustomersToLark,
                } = require("./db/customerLarkService");
                const customers = await getCustomers();
                if (
                  customers &&
                  customers.data &&
                  Array.isArray(customers.data)
                ) {
                  return await syncCustomersToLark(customers.data);
                }
                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
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
