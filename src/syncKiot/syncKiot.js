const userService = require("../db/userService");
const orderService = require("../db/orderService");
const invoiceService = require("../db/invoiceService");
const productService = require("../db/productService");
const customerService = require("../db/customerService");
const surchargeService = require("../db/surchagesService");
const cashFlowService = require("../db/cashflowService");
const purchaseOrderService = require("../db/purchaseOrderService");
const transferService = require("../db/transferService");
const returnService = require("../db/returnService");
const trademarkService = require("../db/trademarkService");
const attributeService = require("../db/attributeService");
const productOnHandsService = require("../db/productOnHandsService");
const branchService = require("../db/branchService");
const pricebookService = require("../db/pricebookService");
const { runCustomerSyncDual } = require("./syncKiotWithLark");

const {
  cashflowScheduler,
  cashflowSchedulerCurrent,
} = require("../../scheduler/cashflowScheduler");

const {
  orderScheduler,
  orderSchedulerCurrent,
} = require("../../scheduler/orderScheduler");

const {
  invoiceScheduler,
  invoiceSchedulerCurrent,
} = require("../../scheduler/invoiceScheduler");

const {
  productScheduler,
  productSchedulerCurrent,
} = require("../../scheduler/productScheduler");

const {
  customerScheduler,
  customerSchedulerCurrent,
} = require("../../scheduler/customerScheduler");

const {
  userScheduler,
  userSchedulerCurrent,
} = require("../../scheduler/userScheduler");

const {
  surchargeScheduler,
  surchargeSchedulerCurrent,
} = require("../../scheduler/surchargeScheduler");

const {
  purchaseOrderScheduler,
  purchaseOrderSchedulerCurrent,
} = require("../../scheduler/purchaseOrderScheduler");

const {
  transferScheduler,
  transferSchedulerCurrent,
} = require("../../scheduler/transferScheduler");

const {
  salechannelSchedulerCurrent,
} = require("../../scheduler/salechannelScheduler");

const {
  returnScheduler,
  returnSchedulerCurrent,
} = require("../../scheduler/returnScheduler");

const {
  trademarkScheduler,
  trademarkSchedulerCurrent,
} = require("../../scheduler/trademarkScheduler");

const {
  attributeScheduler,
  attributeSchedulerCurrent,
} = require("../../scheduler/attributeScheduler");

const {
  productOnHandsScheduler,
  productOnHandsSchedulerCurrent,
} = require("../../scheduler/productOnHandsScheduler");

const {
  branchScheduler,
  branchSchedulerCurrent,
} = require("../../scheduler/branchScheduler");

const {
  pricebookScheduler,
  pricebookSchedulerCurrent,
} = require("../../scheduler/pricebookScheduler");

const runOrderSync = async () => {
  try {
    const syncStatus = await orderService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await orderScheduler(160);

      if (result.success) {
        console.log("Historical orders data has been saved to database");
      } else {
        console.error(
          "Error when saving historical orders data:",
          result.error
        );
      }
    } else {
      const currentResult = await orderSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current orders data has been added: ${currentResult.savedCount} orders`
        );
      } else {
        console.error("Error when adding current orders:", currentResult.error);
      }
    }
  } catch (error) {
    console.error("Cannot get and save data orders:", error);
  }
};

const runInvoiceSync = async () => {
  try {
    const syncStatus = await invoiceService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await invoiceScheduler(160);

      if (result.success) {
        console.log("Historical invoices data has been saved to database");
      } else {
        console.error("Error when saving historical data:", result.error);
      }
    } else {
      const currentResult = await invoiceSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current invoices data has been added: ${currentResult.savedCount} invoices`
        );
      } else {
        console.error(
          "Error when adding current invoices:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data invoices:", error);
  }
};

const runProductSync = async () => {
  try {
    const syncStatus = await productService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await productScheduler(160);

      if (result.success) {
        console.log("Historical products data has been saved to database");
      } else {
        console.log("Error when saving historical data:", result.error);
      }
    } else {
      const currentResult = await productSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current products data has been added: ${currentResult.savedCount} products`
        );
      } else {
        console.log(`Error when adding current products:`, currentResult.error);
      }
    }
  } catch (error) {
    console.log("Cannot get and save data products:", error);
  }
};

const runCustomerSync = async (options = {}) => {
  // ✅ FIXED: Default to lark-only mode for your priority
  const {
    syncMode = process.env.CUSTOMER_SYNC_MODE || "lark-only", // ✅ Default to lark-only
    skipMySQL = true, // ✅ Default skip MySQL for lark priority
    skipLark = false, // ✅ Never skip Lark
    forceLarkSync = false,
    daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS) || 176,
  } = options;

  console.log(`🚀 Starting Customer Sync - Mode: ${syncMode}`);
  console.log(
    `⚙️ Configuration: skipMySQL=${skipMySQL}, skipLark=${skipLark}, daysAgo=${daysAgo}`
  );

  try {
    let results;

    switch (syncMode) {
      case "lark-only":
        console.log("📋 LARK-ONLY MODE: Syncing ONLY to Lark Base...");
        results = await runCustomerSyncDual({
          skipMySQL: true, // ✅ FORCE skip MySQL
          skipLark: false, // ✅ ALWAYS sync to Lark
          forceLarkSync,
          daysAgo,
        });
        break;

      case "mysql-only":
        console.log("🗄️ MySQL-ONLY MODE: Syncing ONLY to MySQL...");
        results = await runCustomerSyncDual({
          skipMySQL: false, // ✅ Sync to MySQL
          skipLark: true, // ✅ Skip Lark
          forceLarkSync: false,
          daysAgo,
        });
        break;

      case "lark-first":
        console.log("📋 LARK-FIRST MODE: Lark priority, then MySQL...");
        // Phase 1: Lark only
        console.log("🔄 Phase 1: Syncing to Lark...");
        const larkResult = await runCustomerSyncDual({
          skipMySQL: true,
          skipLark: false,
          forceLarkSync,
          daysAgo,
        });

        if (larkResult.overall.success) {
          console.log("✅ Lark sync completed! Starting MySQL...");
          // Phase 2: MySQL only
          console.log("🔄 Phase 2: Syncing to MySQL...");
          const mysqlResult = await runCustomerSyncDual({
            skipMySQL: false,
            skipLark: true,
            forceLarkSync: false,
            daysAgo,
          });

          results = {
            mysql: mysqlResult.mysql,
            lark: larkResult.lark,
            overall: {
              success:
                larkResult.overall.success && mysqlResult.overall.success,
              mysqlStatus: mysqlResult.overall.mysqlStatus,
              larkStatus: larkResult.overall.larkStatus,
              sequence: "lark-first",
              completedAt: new Date().toISOString(),
            },
          };
        } else {
          console.error("❌ Lark sync failed, skipping MySQL");
          results = larkResult;
        }
        break;

      case "both":
        console.log(
          "🔄 DUAL MODE: Syncing to both MySQL and Lark simultaneously..."
        );
        results = await runCustomerSyncDual({
          skipMySQL: false,
          skipLark: false,
          forceLarkSync,
          daysAgo,
        });
        break;

      default:
        console.log(
          `⚠️ Unknown sync mode: ${syncMode}, defaulting to lark-only`
        );
        results = await runCustomerSyncDual({
          skipMySQL: true,
          skipLark: false,
          forceLarkSync,
          daysAgo,
        });
        break;
    }

    if (results.overall.success) {
      console.log(`✅ Customer sync (${syncMode}) completed successfully!`);
      if (syncMode === "lark-only") {
        console.log(
          "📋 Lark-only sync stats:",
          results.lark.stats || "No stats available"
        );
      }
    } else {
      console.log(
        `⚠️ Customer sync (${syncMode}) completed with issues:`,
        results.overall
      );
    }

    return results;
  } catch (error) {
    console.error(`❌ Customer sync (${syncMode}) failed:`, error.message);
    return {
      success: false,
      error: error.message,
      syncMode: syncMode,
      overall: { success: false, error: error.message },
    };
  }
};

const runUserSync = async () => {
  try {
    const syncStatus = await userService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await userScheduler(160);

      if (result.success) {
        console.log("Historical users data has been saved to database");
      } else {
        console.error("Error when saving historical users data:", result.error);
      }
    } else {
      const currentResult = await userSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current users data has been added: ${currentResult.savedCount} users`
        );
      } else {
        console.error("Error when adding current users:", currentResult.error);
      }
    }
  } catch (error) {
    console.error("Cannot get and save data users:", error);
  }
};

const runSurchargeSync = async () => {
  try {
    const syncStatus = await surchargeService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await surchargeScheduler(160);

      if (result.success) {
        console.log("Historical surcharges data has been saved to database");
      } else {
        console.error(
          "Error when saving historical surcharges data:",
          result.error
        );
      }
    } else {
      const currentResult = await surchargeSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current surcharges data has been added: ${currentResult.savedCount} surcharges`
        );
      } else {
        console.error(
          "Error when adding current surcharges:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data surcharges:", error);
  }
};

const runCashflowSync = async () => {
  try {
    console.log("🚀 Starting Cashflow Sync Process...");
    const syncStatus = await cashFlowService.getSyncStatus();
    console.log("Cashflow Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical cashflow sync...");
      // Start with fewer days for testing, then increase gradually
      const result = await cashflowScheduler(30); // Reduced from 250 to 30 days for initial testing

      if (result.success) {
        console.log("✅ Historical cashflows data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical cashflows data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current cashflow sync...");
      const currentResult = await cashflowSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current cashflows data has been added: ${currentResult.savedCount} cashflows`
        );
      } else {
        console.error(
          "❌ Error when adding current cashflows:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Error during cashflow sync:", error);
    console.error("Stack trace:", error.stack);
    return { success: false, error: error.message };
  }
};

const runPurchaseOrderSync = async () => {
  try {
    console.log("🚀 Starting Purchase Order Sync Process...");
    const syncStatus = await purchaseOrderService.getSyncStatus();
    console.log("Purchase Order Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical purchase order sync...");
      const result = await purchaseOrderScheduler(160);

      if (result.success) {
        console.log(
          "✅ Historical purchase orders data has been saved to database"
        );
      } else {
        console.error(
          "❌ Error when saving historical purchase orders data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current purchase order sync...");
      const currentResult = await purchaseOrderSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current purchase orders data has been added: ${currentResult.savedCount} purchase orders`
        );
      } else {
        console.error(
          "❌ Error when adding current purchase orders:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save purchase orders data:", error);
    console.error("Stack trace:", error.stack);
  }
};

const runTransferSync = async () => {
  try {
    console.log("🚀 Starting Transfer Sync Process...");
    const syncStatus = await transferService.getSyncStatus();
    console.log("Transfer Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical transfer sync...");
      const result = await transferScheduler(160);

      if (result.success) {
        console.log("✅ Historical transfers data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical transfers data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current transfer sync...");
      const currentResult = await transferSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current transfers data has been added: ${currentResult.savedCount} transfers`
        );
      } else {
        console.error(
          "❌ Error when adding current transfers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save transfers data:", error);
    console.error("Stack trace:", error.stack);
  }
};

const runSaleChannelSync = async () => {
  try {
    console.log("🚀 Starting Sale Channel Sync Process...");
    const currentResult = await salechannelSchedulerCurrent();

    if (currentResult.success) {
      console.log(
        `✅ Current sale channels data has been added: ${currentResult.savedCount} sale channels`
      );
    } else {
      console.error(
        "❌ Error when adding current sale channels:",
        currentResult.error
      );
    }
  } catch (error) {
    console.error("❌ Cannot get and save sale channels data:", error);
  }
};

const runReturnSync = async () => {
  try {
    console.log("🚀 Starting Returns Sync Process...");
    const syncStatus = await returnService.getSyncStatus();
    console.log("Returns Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical returns sync...");
      const result = await returnScheduler(160); // Same as your other entities

      if (result.success) {
        console.log("✅ Historical returns data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical returns data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current returns sync...");
      const currentResult = await returnSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current returns data has been added: ${currentResult.savedCount} returns`
        );
      } else {
        console.error(
          "❌ Error when adding current returns:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save data returns:", error);
  }
};

const runOrderSupplierSync = async () => {
  try {
    console.log("🚀 Starting Order Supplier Sync Process...");
    const orderSupplierService = require("../db/orderSupplierService");
    const {
      orderSupplierSchedulerCurrent,
    } = require("../../scheduler/orderSupplierScheduler");

    // OrderSuppliers API doesn't support historical data, so we always run current sync
    console.log("🔄 Running order supplier sync (all records)...");
    const result = await orderSupplierSchedulerCurrent();

    if (result.success) {
      console.log(
        `✅ Order supplier sync completed: ${result.savedCount} new order suppliers`
      );
    } else {
      console.error("❌ Error when syncing order suppliers:", result.error);
    }
  } catch (error) {
    console.error("❌ Cannot sync order suppliers data:", error);
    console.error("Stack trace:", error.stack);
  }
};

const runLocationSync = async (forceSync = false) => {
  try {
    console.log("🏢 Starting Location Sync Process...");
    const locationService = require("../db/locationService");
    const {
      locationSchedulerOneTime,
      checkLocationSyncStatus,
    } = require("../../scheduler/locationScheduler");

    // Check current status
    const status = await checkLocationSyncStatus();
    console.log("Location Status:", {
      locationCount: status.locationCount,
      lastSync: status.lastSync,
      needsSync: status.needsSync,
    });

    if (!status.needsSync && !forceSync) {
      console.log(
        `✅ Locations already synchronized (${status.locationCount} locations). Use forceSync=true to re-sync.`
      );
      return {
        success: true,
        message: `${status.locationCount} locations already exist`,
        skipped: true,
      };
    }

    console.log(
      forceSync
        ? "🔄 Force syncing locations..."
        : "🔄 Running initial location sync..."
    );
    const result = await locationSchedulerOneTime(forceSync);

    if (result.success) {
      console.log(`✅ Location sync completed: ${result.message || "Success"}`);
    } else {
      console.error("❌ Error when syncing locations:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ Cannot sync locations data:", error);
    console.error("Stack trace:", error.stack);
    return { success: false, error: error.message };
  }
};

const runTrademarkSync = async () => {
  console.log("🚀 Starting Trademark Sync Process...");
  try {
    const syncStatus = await trademarkService.getSyncStatus();
    console.log("Trademark Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical trademark sync...");
      const result = await trademarkScheduler(250);

      if (result.success) {
        console.log("✅ Historical trademarks data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical trademarks data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current trademark sync...");
      const currentResult = await trademarkSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current trademarks data has been added: ${currentResult.savedCount} trademarks`
        );
      } else {
        console.error(
          "❌ Error when adding current trademarks:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("💥 Cannot get and save trademark data:", error);
  }
};

const runAttributeSync = async () => {
  console.log("🏷️ Starting Attribute Sync Process...");
  try {
    const syncStatus = await attributeService.getSyncStatus();
    console.log("Attribute Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running initial attribute sync...");
      const result = await attributeScheduler();

      if (result.success) {
        console.log("✅ Initial attributes data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving initial attributes data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current attribute sync...");
      const currentResult = await attributeSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current attributes data has been synced: ${currentResult.savedCount} attributes`
        );
      } else {
        console.error(
          "❌ Error when syncing current attributes:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save attribute data:", error);
  }
};

const runProductOnHandsSync = async () => {
  try {
    console.log("🚀 Starting ProductOnHands Sync Process...");
    const syncStatus = await productOnHandsService.getSyncStatus();
    console.log("ProductOnHands Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical productOnHands sync...");
      const result = await productOnHandsScheduler(160);

      if (result.success) {
        console.log(
          "✅ Historical productOnHands data has been saved to database"
        );
      } else {
        console.error(
          "❌ Error when saving historical productOnHands data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current productOnHands sync...");
      const currentResult = await productOnHandsSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current productOnHands data has been added: ${currentResult.savedCount} items`
        );
      } else {
        console.error(
          "❌ Error when adding current productOnHands:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save productOnHands data:", error);
    console.error("Stack trace:", error.stack);
  }
};

const runBranchSync = async () => {
  console.log("🚀 Starting Branch Sync Process...");
  try {
    const syncStatus = await branchService.getSyncStatus();
    console.log("Branch Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical branch sync...");
      const result = await branchScheduler(160);

      if (result.success) {
        console.log("✅ Historical branches data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical branches data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current branch sync...");
      const currentResult = await branchSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current branches data has been added: ${currentResult.savedCount} branches`
        );
      } else {
        console.error(
          "❌ Error when saving current branches data:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot sync branches data:", error);
    console.error("Stack trace:", error.stack);
  }
};

const runPricebookSync = async () => {
  console.log("💰 Starting Pricebook Sync Process...");
  try {
    const syncStatus = await pricebookService.getSyncStatus();
    console.log("Pricebook Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical pricebook sync...");
      const result = await pricebookScheduler(250); // Parameter ignored for full sync

      if (result.success) {
        console.log("✅ Historical pricebook data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical pricebook data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current pricebook sync...");
      const currentResult = await pricebookSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current pricebook data has been added: ${currentResult.savedCount} pricebooks`
        );
      } else {
        console.error(
          "❌ Error when adding current pricebooks:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("💥 Cannot get and save pricebook data:", error);
  }
};

module.exports = {
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
  runTrademarkSync,
  runAttributeSync,
  runProductOnHandsSync,
  runBranchSync,
  runPricebookSync,
};
