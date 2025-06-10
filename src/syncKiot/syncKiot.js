const userService = require("../db/userService");
const orderService = require("../db/orderService");
const invoiceService = require("../db/invoiceService");
const productService = require("../db/productService");
const customerService = require("../db/customerService");
const surchargeService = require("../db/surchagesService");
const cashFlowService = require("../db/cashflowService");
const purchaseOrderService = require("../db/purchaseOrderService");
const transferService = require("../db/transferService");
const pricebookService = require("../db/pricebookService");

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

const runPricebookSync = async () => {
  try {
    const syncStatus = await pricebookService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical pricebooks data sync...");
      const result = await pricebookScheduler(160);

      if (result.success) {
        console.log("Historical pricebooks data has been saved to database");
      } else {
        console.error(
          "Error when saving historical pricebooks data:",
          result.error
        );
      }
    } else {
      console.log("Running current pricebooks sync...");
      const currentResult = await pricebookSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current pricebooks data has been added: ${currentResult.savedCount} pricebooks`
        );
        if (currentResult.productPricesUpdated) {
          console.log(
            `Product prices updated: ${currentResult.productPricesUpdated} prices`
          );
        }
      } else {
        console.error(
          "Error when adding current pricebooks:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data pricebooks:", error);
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
  runPricebookSync,
};
