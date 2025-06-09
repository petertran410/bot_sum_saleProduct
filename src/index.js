require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
} = require("./syncKiot/syncKiot");
const { getProducts } = require("./kiotviet");
const { getCustomers } = require("./kiotviet");
const { getUsers } = require("./kiotviet");
const { testConnection } = require("./db");
const { initializeDatabase } = require("./db/init");
const { addRecordToCRMBase, getCRMStats, sendTestMessage } = require("./lark");

const app = express();
const PORT = process.env.PORT || 3690;
console.log(PORT);

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
    console.log(`✅ CORS preflight for ${req.path}`);
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
  // Allow your specific domain and common local development
  const allowedOrigins = [
    "https://www.traphuonghoang.com",
    "https://traphuonghoang.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "file://", // For local HTML files
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Essential CORS headers
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    console.log(`✅ CORS preflight handled for ${req.path}`);
    return res.status(200).end();
  }

  next();
});

app.get("/api/health", (req, res) => {
  console.log("🏥 Health check requested");
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
    console.log("📝 New registration received:", req.body);
    console.log("🌐 Client IP:", req.clientIP);

    // Validate required fields
    const { name, phone, email, type, ticket, city } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phone, email",
        code: "MISSING_FIELDS",
      });
    }

    // Add client info to form data
    const formDataWithIP = {
      ...req.body,
      clientIP: req.clientIP,
      userAgent: req.get("User-Agent"),
    };

    // Add record to CRM Base
    const result = await addRecordToCRMBase(formDataWithIP);

    if (result.success) {
      console.log(`✅ Registration processed successfully: STT ${result.stt}`);

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

/**
 * Get CRM statistics
 */
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

/**
 * Test LarkSuite connection
 */
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

/**
 * Webhook endpoint for LarkSuite (optional)
 */
app.post("/api/webhook/lark", (req, res) => {
  try {
    console.log("📨 LarkSuite webhook received:", req.body);

    // Handle webhook events if needed
    // For example: when someone updates a CRM record

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

app.get("/save-user", async (req, res) => {
  try {
    await runUserSync();
    res.json({
      success: true,
      message: "User synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during user synchronization",
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

app.get("/get-users", async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    console.log("Cannot get users", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
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

    const dbInitialized = await initializeDatabase();

    if (!dbInitialized) {
      console.error("Failed to initialize database schema.");
      process.exit(1);
    }
    console.log("Database schema initialization completed.");

    const server = app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 CRM Health: http://localhost:${PORT}/api/health`);
      console.log(
        `📝 CRM Registration: http://localhost:${PORT}/api/submit-registration`
      );
      console.log(`📈 CRM Stats: http://localhost:${PORT}/api/crm/stats`);
      console.log(`🔧 LarkSuite Test: http://localhost:${PORT}/api/test-lark`);

      const historicalDaysAgo = parseInt(process.env.INITIAL_SCAN_DAYS || "7");

      const orderSyncStatus =
        await require("../src/db/orderService").getSyncStatus();
      const invoiceSyncStatus =
        await require("../src/db/invoiceService").getSyncStatus();
      const customerSyncStatus =
        await require("../src/db/customerService").getSyncStatus();
      const productSyncStatus =
        await require("../src/db/productService").getSyncStatus();
      const userSyncStatus =
        await require("../src/db/userService").getSyncStatus();

      if (!userSyncStatus.historicalCompleted) {
        console.log(
          `Syncing ${historicalDaysAgo} days of historical user data...`
        );
        await require("../scheduler/userScheduler").userScheduler(
          historicalDaysAgo
        );
      }

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
      await runUserSync();
      await runOrderSync();
      await runInvoiceSync();
      await runCustomerSync();
      await runProductSync();

      const runAllSyncs = async () => {
        try {
          console.log(`[${new Date().toISOString()}] Starting sync cycle...`);

          await Promise.all([
            runUserSync(),
            runOrderSync(),
            runInvoiceSync(),
            runCustomerSync(),
            runProductSync(),
          ]);

          console.log(`[${new Date().toISOString()}] Sync cycle completed.`);
        } catch (error) {
          console.error("Error during simultaneous sync:", error);
        }
      };

      // Run sync every 10 minutes (10 * 60 * 1000 ms)
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

// Start the server
startServer();
