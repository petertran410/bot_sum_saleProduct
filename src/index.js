// src/index.js - FIXED VERSION with proper sync order
require("dotenv").config();
const express = require("express");
const {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  runCategorySync,
  runBranchSync,
  runSupplierSync,
  runBankAccountSync,
  runTransferSync,
  runPriceBookSync,
  runPurchaseOrderSync,
  runReceiptSync,
  runReturnSync,
  runSurchargeSync,
  // NEW MISSING FUNCTIONS - ADD THESE TO syncKiot.js
  runInventoryAdjustmentSync,
  runDamageReportSync,
} = require("./syncKiot/syncKiot");

const {
  getProducts,
  getCustomers,
  getUsers,
  getCategories,
  getBranches,
  getSuppliers,
  getBankAccounts,
  getTransfers,
  getPriceBooks,
  getPurchaseOrders,
  getReceipts,
  getReturns,
  getSurcharges,
  // NEW MISSING API FUNCTIONS - ADD THESE TO kiotviet.js
  getInventoryAdjustments,
  getDamageReports,
} = require("./kiotviet");

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
      sync: {
        order: "/save-order",
        invoice: "/save-invoice",
        product: "/save-product",
        customer: "/save-customer",
        user: "/save-user",
        category: "/save-category",
        branch: "/save-branch",
        supplier: "/save-supplier",
        bankAccount: "/save-bank-account",
        transfer: "/save-transfer",
        priceBook: "/save-price-book",
        purchaseOrder: "/save-purchase-order",
        receipt: "/save-receipt",
        return: "/save-return",
        surcharge: "/save-surcharge",
        inventoryAdjustment: "/save-inventory-adjustment",
        damageReport: "/save-damage-report",
      },
      get: {
        products: "/get-products",
        customers: "/get-customers",
        users: "/get-users",
        categories: "/get-categories",
        branches: "/get-branches",
        suppliers: "/get-suppliers",
        bankAccounts: "/get-bank-accounts",
        transfers: "/get-transfers",
        priceBooks: "/get-price-books",
        purchaseOrders: "/get-purchase-orders",
        receipts: "/get-receipts",
        returns: "/get-returns",
        surcharges: "/get-surcharges",
        inventoryAdjustments: "/get-inventory-adjustments",
        damageReports: "/get-damage-reports",
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// CORS setup (keep existing)
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
    console.log(`✅ CORS preflight handled for ${req.path}`);
    return res.status(200).end();
  }

  next();
});

// API endpoints (keep existing ones)
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

// EXISTING SYNC ENDPOINTS (keep all existing ones)
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

app.get("/save-category", async (req, res) => {
  try {
    await runCategorySync();
    res.json({
      success: true,
      message: "Category synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during category synchronization",
      error: error.message,
    });
  }
});

app.get("/save-branch", async (req, res) => {
  try {
    await runBranchSync();
    res.json({
      success: true,
      message: "Branch synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during branch synchronization",
      error: error.message,
    });
  }
});

app.get("/save-supplier", async (req, res) => {
  try {
    await runSupplierSync();
    res.json({
      success: true,
      message: "Supplier synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during supplier synchronization",
      error: error.message,
    });
  }
});

app.get("/save-bank-account", async (req, res) => {
  try {
    await runBankAccountSync();
    res.json({
      success: true,
      message: "Bank account synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during bank account synchronization",
      error: error.message,
    });
  }
});

app.get("/save-transfer", async (req, res) => {
  try {
    await runTransferSync();
    res.json({
      success: true,
      message: "Transfer synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during transfer synchronization",
      error: error.message,
    });
  }
});

app.get("/save-price-book", async (req, res) => {
  try {
    await runPriceBookSync();
    res.json({
      success: true,
      message: "Price book synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during price book synchronization",
      error: error.message,
    });
  }
});

app.get("/save-purchase-order", async (req, res) => {
  try {
    await runPurchaseOrderSync();
    res.json({
      success: true,
      message: "Purchase order synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during purchase order synchronization",
      error: error.message,
    });
  }
});

app.get("/save-receipt", async (req, res) => {
  try {
    await runReceiptSync();
    res.json({
      success: true,
      message: "Receipt synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during receipt synchronization",
      error: error.message,
    });
  }
});

app.get("/save-return", async (req, res) => {
  try {
    await runReturnSync();
    res.json({
      success: true,
      message: "Return synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during return synchronization",
      error: error.message,
    });
  }
});

app.get("/save-surcharge", async (req, res) => {
  try {
    await runSurchargeSync();
    res.json({
      success: true,
      message: "Surcharge synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during surcharge synchronization",
      error: error.message,
    });
  }
});

// NEW ENDPOINTS FOR MISSING ENTITIES
app.get("/save-inventory-adjustment", async (req, res) => {
  try {
    await runInventoryAdjustmentSync();
    res.json({
      success: true,
      message: "Inventory adjustment synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during inventory adjustment synchronization",
      error: error.message,
    });
  }
});

app.get("/save-damage-report", async (req, res) => {
  try {
    await runDamageReportSync();
    res.json({
      success: true,
      message: "Damage report synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during damage report synchronization",
      error: error.message,
    });
  }
});

// GET ENDPOINTS (keep all existing ones + add new ones)
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

app.get("/get-categories", async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (error) {
    console.log("Cannot get categories", error);
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
});

app.get("/get-branches", async (req, res) => {
  try {
    const branches = await getBranches();
    res.json(branches);
  } catch (error) {
    console.log("Cannot get branches", error);
    res.status(500).json({
      success: false,
      message: "Error fetching branches",
      error: error.message,
    });
  }
});

app.get("/get-suppliers", async (req, res) => {
  try {
    const suppliers = await getSuppliers();
    res.json(suppliers);
  } catch (error) {
    console.log("Cannot get suppliers", error);
    res.status(500).json({
      success: false,
      message: "Error fetching suppliers",
      error: error.message,
    });
  }
});

app.get("/get-bank-accounts", async (req, res) => {
  try {
    const bankAccounts = await getBankAccounts();
    res.json(bankAccounts);
  } catch (error) {
    console.log("Cannot get bank accounts", error);
    res.status(500).json({
      success: false,
      message: "Error fetching bank accounts",
      error: error.message,
    });
  }
});

app.get("/get-transfers", async (req, res) => {
  try {
    const transfers = await getTransfers();
    res.json(transfers);
  } catch (error) {
    console.log("Cannot get transfers", error);
    res.status(500).json({
      success: false,
      message: "Error fetching transfers",
      error: error.message,
    });
  }
});

app.get("/get-price-books", async (req, res) => {
  try {
    const priceBooks = await getPriceBooks();
    res.json(priceBooks);
  } catch (error) {
    console.log("Cannot get price books", error);
    res.status(500).json({
      success: false,
      message: "Error fetching price books",
      error: error.message,
    });
  }
});

app.get("/get-purchase-orders", async (req, res) => {
  try {
    const purchaseOrders = await getPurchaseOrders();
    res.json(purchaseOrders);
  } catch (error) {
    console.log("Cannot get purchase orders", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchase orders",
      error: error.message,
    });
  }
});

app.get("/get-receipts", async (req, res) => {
  try {
    const receipts = await getReceipts();
    res.json(receipts);
  } catch (error) {
    console.log("Cannot get receipts", error);
    res.status(500).json({
      success: false,
      message: "Error fetching receipts",
      error: error.message,
    });
  }
});

app.get("/get-returns", async (req, res) => {
  try {
    const returns = await getReturns();
    res.json(returns);
  } catch (error) {
    console.log("Cannot get returns", error);
    res.status(500).json({
      success: false,
      message: "Error fetching returns",
      error: error.message,
    });
  }
});

app.get("/get-surcharges", async (req, res) => {
  try {
    const surcharges = await getSurcharges();
    res.json(surcharges);
  } catch (error) {
    console.log("Cannot get surcharges", error);
    res.status(500).json({
      success: false,
      message: "Error fetching surcharges",
      error: error.message,
    });
  }
});

app.get("/get-inventory-adjustments", async (req, res) => {
  try {
    const inventoryAdjustments = await getInventoryAdjustments();
    res.json(inventoryAdjustments);
  } catch (error) {
    console.log("Cannot get inventory adjustments", error);
    res.status(500).json({
      success: false,
      message: "Error fetching inventory adjustments",
      error: error.message,
    });
  }
});

app.get("/get-damage-reports", async (req, res) => {
  try {
    const damageReports = await getDamageReports();
    res.json(damageReports);
  } catch (error) {
    console.log("Cannot get damage reports", error);
    res.status(500).json({
      success: false,
      message: "Error fetching damage reports",
      error: error.message,
    });
  }
});

async function runSequentialSync() {
  try {
    await Promise.all([
      runCategorySync(),
      runBranchSync(),
      runSupplierSync(),
      runBankAccountSync(),
      runUserSync(),
    ]);

    await Promise.all([
      runCustomerSync(),
      runProductSync(),
      runPriceBookSync(),
    ]);

    await Promise.all([
      runOrderSync(),
      runInvoiceSync(),
      runPurchaseOrderSync(),
    ]);

    await Promise.all([
      // runTransferSync(),
      runReceiptSync(),
      runReturnSync(),
      runSurchargeSync(),
      runInventoryAdjustmentSync(),
      runDamageReportSync(),
    ]);
  } catch (error) {
    console.error("❌ Error during sequential sync:", error);
    throw error;
  }
}

async function startServer() {
  try {
    // Test database connection
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

      const bankAccountSyncStatus =
        await require("./db/backAccountService").getSyncStatus();
      const branchSyncStatus =
        await require("./db/branchService").getSyncStatus();
      const categorySyncStatus =
        await require("./db/categoryService").getSyncStatus();
      const customerGroupSyncStatus =
        await require("./db/customerGroupService").getSyncStatus();
      const customerSyncStatus =
        await require("./db/customerService").getSyncStatus();
      const damageReportSyncStatus =
        await require("./db/damageReportService").getSyncStatus();
      const inventoryAdjustmentSyncStatus =
        await require("./db/inventoryAdjustmentService").getSyncStatus();
      const invoiceSyncStatus =
        await require("./db/invoiceService").getSyncStatus();
      const locationSyncStatus =
        await require("./db/locationService").getSyncStatus();
      const orderSyncStatus =
        await require("./db/orderService").getSyncStatus();
      const priceBookSyncStatus =
        await require("./db/priceBookService").getSyncStatus();
      const productSyncStatus =
        await require("./db/productService").getSyncStatus();
      const purchaseOrderSyncStatus =
        await require("./db/purchaseOrderService").getSyncStatus();
      const receiptSyncStatus =
        await require("./db/receiptService").getSyncStatus();
      const returnSyncStatus =
        await require("./db/returnService").getSyncStatus();
      const supplierSyncStatus =
        await require("./db/supplierService").getSyncStatus();
      const surchargeSyncStatus =
        await require("./db/surchargeService").getSyncStatus();
      const transferSyncStatus =
        await require("./db/transferService").getSyncStatus();
      const userSyncStatus = await require("./db/userService").getSyncStatus();

      if (
        !bankAccountSyncStatus.historicalCompleted ||
        !branchSyncStatus.historicalCompleted ||
        !categorySyncStatus.historicalCompleted ||
        !customerGroupSyncStatus.historicalCompleted ||
        !customerSyncStatus.historicalCompleted ||
        !damageReportSyncStatus.historicalCompleted ||
        !inventoryAdjustmentSyncStatus.historicalCompleted ||
        !invoiceSyncStatus.historicalCompleted ||
        !locationSyncStatus.historicalCompleted ||
        !orderSyncStatus.historicalCompleted ||
        !priceBookSyncStatus.historicalCompleted ||
        !productSyncStatus.historicalCompleted ||
        !purchaseOrderSyncStatus.historicalCompleted ||
        !receiptSyncStatus.historicalCompleted ||
        !returnSyncStatus.historicalCompleted ||
        !supplierSyncStatus.historicalCompleted ||
        !surchargeSyncStatus.historicalCompleted ||
        !transferSyncStatus.historicalCompleted ||
        !userSyncStatus.historicalCompleted
      ) {
        if (!bankAccountSyncStatus.historicalCompleted) {
          await require("../scheduler/bankAccountScheduler").bankAccountScheduler(
            historicalDaysAgo
          );
        }
        if (!branchSyncStatus.historicalCompleted) {
          await require("../scheduler/branchScheduler").branchScheduler(
            historicalDaysAgo
          );
        }
        if (!categorySyncStatus.historicalCompleted) {
          await require("../scheduler/categoryScheduler").categoryScheduler(
            historicalDaysAgo
          );
        }
        if (!customerGroupSyncStatus.historicalCompleted) {
          await require("../scheduler/customerGroupScheduler").customerGroupScheduler(
            historicalDaysAgo
          );
        }

        if (!supplierSyncStatus.historicalCompleted) {
          await require("../scheduler/supplierScheduler").supplierScheduler(
            historicalDaysAgo
          );
        }

        if (!userSyncStatus.historicalCompleted) {
          await require("../scheduler/userScheduler").userScheduler(
            historicalDaysAgo
          );
        }
        if (!customerSyncStatus.historicalCompleted) {
          await require("../scheduler/customerScheduler").customerScheduler(
            historicalDaysAgo
          );
        }
        if (!productSyncStatus.historicalCompleted) {
          await require("../scheduler/productScheduler").productScheduler(
            historicalDaysAgo
          );
        }
        if (!orderSyncStatus.historicalCompleted) {
          await require("../scheduler/orderScheduler").orderScheduler(
            historicalDaysAgo
          );
        }
        if (!invoiceSyncStatus.historicalCompleted) {
          await require("../scheduler/invoiceScheduler").invoiceScheduler(
            historicalDaysAgo
          );
        }
      }

      await runSequentialSync();

      const syncInterval = setInterval(runSequentialSync, 10 * 60 * 1000);

      process.on("SIGINT", () => {
        clearInterval(syncInterval);
        server.close(() => {
          process.exit(0);
        });
      });
    });

    return server;
  } catch (error) {
    process.exit(1);
  }
}

startServer();
