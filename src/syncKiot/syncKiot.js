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

const runCustomerSync = async () => {
  console.log("🚀 Starting Customer Sync Process...");
  try {
    const syncStatus = await customerService.getSyncStatus();
    console.log("Customer Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical customer sync...");
      const result = await customerScheduler(250);

      if (result.success) {
        console.log("✅ Historical customers data has been saved to database");
      } else {
        console.error(
          "❌ Error when saving historical customers data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current customer sync...");
      const currentResult = await customerSchedulerCurrent();

      if (currentResult.success) {
        console.log(`✅ Current customers data has been added`);
      } else {
        console.error(
          "❌ Error when adding current customers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save customers data:", error);
    console.error("Stack trace:", error.stack);
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
      orderSupplierScheduler,
      orderSupplierSchedulerCurrent,
    } = require("../../scheduler/orderSupplierScheduler");

    const syncStatus = await orderSupplierService.getSyncStatus();
    console.log("Order Supplier Sync Status:", syncStatus);

    if (!syncStatus.historicalCompleted) {
      console.log("📅 Running historical order supplier sync...");
      const result = await orderSupplierScheduler(160);

      if (result.success) {
        console.log(
          "✅ Historical order suppliers data has been saved to database"
        );
      } else {
        console.error(
          "❌ Error when saving historical order suppliers data:",
          result.error
        );
      }
    } else {
      console.log("🔄 Running current order supplier sync...");
      const currentResult = await orderSupplierSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `✅ Current order suppliers data has been added: ${currentResult.savedCount} order suppliers`
        );
      } else {
        console.error(
          "❌ Error when adding current order suppliers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("❌ Cannot get and save order suppliers data:", error);
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
};
