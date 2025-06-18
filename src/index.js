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

app.post("/api/sync/customer-lark/paginated", async (req, res) => {
  try {
    const { enableDuplicationCheck = true } = req.body;
    console.log(
      `🚀 Manual customer Lark PAGINATION sync triggered (duplication check: ${enableDuplicationCheck})`
    );

    const {
      syncAllCustomersToLarkPaginated,
    } = require("./db/customerLarkService");

    const result = await syncAllCustomersToLarkPaginated(
      enableDuplicationCheck
    );

    res.json({
      success: true,
      message: "Customer Lark pagination sync completed",
      data: result.stats,
    });
  } catch (error) {
    console.error("❌ Manual customer Lark pagination sync failed:", error);
    res.status(500).json({
      success: false,
      message: "Customer Lark pagination sync failed",
      error: error.message,
    });
  }
});

// 🔍 DUPLICATION CHECK ENDPOINTS
app.get("/api/sync/customer-lark/duplicates", async (req, res) => {
  try {
    console.log("🔍 Manual duplicate check triggered");

    const { getDuplicateCustomersReport } = require("./db/customerLarkService");

    const result = await getDuplicateCustomersReport();

    res.json({
      success: true,
      message: "Duplicate check completed",
      data: result,
    });
  } catch (error) {
    console.error("❌ Duplicate check failed:", error);
    res.status(500).json({
      success: false,
      message: "Duplicate check failed",
      error: error.message,
    });
  }
});

// Customer Lark sync endpoints
app.post("/api/sync/customer-lark", async (req, res) => {
  try {
    const { enableDuplicationCheck = true } = req.body;
    console.log(
      `🚀 Manual customer Lark current sync triggered (duplication check: ${enableDuplicationCheck})`
    );

    const { syncCustomersToLark } = require("./db/customerLarkService");
    const { getCustomers } = require("./kiotviet");

    // Get current customers and sync to Lark
    const customers = await getCustomers();
    if (customers && customers.data && Array.isArray(customers.data)) {
      const result = await syncCustomersToLark(
        customers.data,
        enableDuplicationCheck
      );
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
    const { enableDuplicationCheck = true } = req.body;
    console.log(
      `🚀 Manual customer Lark historical sync triggered (pagination-based, duplication check: ${enableDuplicationCheck})`
    );

    const {
      syncAllCustomersToLarkPaginated,
    } = require("./db/customerLarkService");

    const result = await syncAllCustomersToLarkPaginated(
      enableDuplicationCheck
    );

    res.json({
      success: true,
      message: "Customer Lark historical sync completed (pagination-based)",
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
            const result = await syncFunction();
            console.log(`✅ ${entityName} sync completed`, result?.stats || "");
            return result;
          } catch (error) {
            console.error(`❌ ${entityName} sync failed:`, error.message);

            // ✅ FIX: For customer lark sync, always update status to prevent infinite loop
            if (entityName.includes("Customer→Lark")) {
              try {
                console.log(
                  `📊 Force updating ${entityName} status due to error...`
                );
                const {
                  updateSyncStatus,
                } = require("./db/customerLarkService");
                await updateSyncStatus(true, new Date());
                console.log(`✅ ${entityName} status updated after error`);
              } catch (statusError) {
                console.error(
                  `❌ Could not update ${entityName} status:`,
                  statusError.message
                );
              }
            }

            return { success: false, error: error.message };
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
              syncAllCustomersToLarkPaginated, // ← NEW PAGINATION SYSTEM
            } = require("./db/customerLarkService");
            console.log(
              "🚀 Starting automatic Customer→Lark historical sync using PAGINATION + DUPLICATION"
            );
            return syncAllCustomersToLarkPaginated(true); // Enable duplication checking
          }, "Customer→Lark Historical (Pagination + Duplication)");
        }

        const syncIntervalSeconds = parseInt(
          process.env.SCAN_INTERVAL_SECONDS || "15"
        );

        // ✅ OPTION 1 IMPLEMENTATION: Current sync with customer_lark protection
        setInterval(async () => {
          try {
            // Get sync statuses
            const [
              userSyncStatus,
              customerSyncStatus,
              productSyncStatus,
              orderSyncStatus,
              currentCustomerLarkSyncStatus,
            ] = await Promise.all([
              getSyncStatusSafely("./db/userService", "Users"),
              getSyncStatusSafely("./db/customerService", "Customers"),
              getSyncStatusSafely("./db/productService", "Products"),
              getSyncStatusSafely("./db/orderService", "Orders"),
              getSyncStatusSafely("./db/customerLarkService", "Customer→Lark"),
            ]);

            // Current syncs - only run if historical is complete
            if (userSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveUsers } = require("./db/userService");
                const { getUsers } = require("./kiotviet");
                return getUsers().then((users) => {
                  if (users && users.data && Array.isArray(users.data)) {
                    return saveUsers(users.data);
                  }
                  return {
                    success: true,
                    stats: { total: 0, success: 0, failed: 0 },
                  };
                });
              }, "Users Current");
            }

            if (customerSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveCustomers } = require("./db/customerService");
                const { getCustomers } = require("./kiotviet");
                return getCustomers().then((customers) => {
                  if (
                    customers &&
                    customers.data &&
                    Array.isArray(customers.data)
                  ) {
                    return saveCustomers(customers.data);
                  }
                  return {
                    success: true,
                    stats: { total: 0, success: 0, failed: 0 },
                  };
                });
              }, "Customers Current");
            }

            if (productSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveProducts } = require("./db/productService");
                const { getProducts } = require("./kiotviet");
                return getProducts().then((products) => {
                  if (
                    products &&
                    products.data &&
                    Array.isArray(products.data)
                  ) {
                    return saveProducts(products.data);
                  }
                  return {
                    success: true,
                    stats: { total: 0, success: 0, failed: 0 },
                  };
                });
              }, "Products Current");
            }

            if (orderSyncStatus.historicalCompleted) {
              await runSyncSafely(() => {
                const { saveOrders } = require("./db/orderService");
                const { getOrders } = require("./kiotviet");
                return getOrders().then((orders) => {
                  if (orders && orders.data && Array.isArray(orders.data)) {
                    return saveOrders(orders.data);
                  }
                  return {
                    success: true,
                    stats: { total: 0, success: 0, failed: 0 },
                  };
                });
              }, "Orders Current");
            }

            // ✅ FIXED Customer Lark current sync
            if (currentCustomerLarkSyncStatus.historicalCompleted) {
              await runSyncSafely(async () => {
                const {
                  syncCustomersToLark,
                  isCurrentSyncRunning,
                } = require("./db/customerLarkService");

                // ✅ Check if sync is already running
                const syncStatus = isCurrentSyncRunning();
                if (syncStatus.running) {
                  console.log(
                    `⏭️ Customer→Lark sync already running for ${Math.round(
                      syncStatus.duration / 1000
                    )}s, skipping this interval`
                  );
                  return {
                    success: true,
                    skipped: true,
                    stats: { total: 0, success: 0, failed: 0 },
                  };
                }

                // ✅ FIX 9: Get only RECENTLY MODIFIED customers
                const { getRecentlyModifiedCustomers } = require("./kiotviet");
                const customers = await getRecentlyModifiedCustomers(48);

                if (
                  customers &&
                  customers.data &&
                  Array.isArray(customers.data)
                ) {
                  // ✅ Filter out customers that haven't actually changed recently
                  const recentCustomers = customers.data.filter((customer) => {
                    if (!customer.modifiedDate) return false;

                    const modifiedTime = new Date(
                      customer.modifiedDate
                    ).getTime();
                    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000; // 2 hours in milliseconds

                    return modifiedTime > twoHoursAgo;
                  });

                  console.log(
                    `🔄 Customer→Lark Current: Processing ${recentCustomers.length} recently modified customers (filtered from ${customers.data.length} total)`
                  );

                  if (recentCustomers.length === 0) {
                    console.log("✅ No recently modified customers to sync");
                    return {
                      success: true,
                      stats: { total: 0, success: 0, failed: 0 },
                    };
                  }

                  // ✅ Enable duplication checking for current sync
                  return await syncCustomersToLark(recentCustomers, true);
                }

                return {
                  success: true,
                  stats: { total: 0, success: 0, failed: 0 },
                };
              }, "Customer→Lark Current (Recently Modified Only)");
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
