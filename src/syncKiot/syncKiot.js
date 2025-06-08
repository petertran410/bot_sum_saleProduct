// src/syncKiot/syncKiot.js - COMPLETE VERSION with all sync functions

const orderService = require("../db/orderService");
const invoiceService = require("../db/invoiceService");
const productService = require("../db/productService");
const customerService = require("../db/customerService");
const userService = require("../db/userService");

// Existing services
const categoryService = require("../db/categoryService");
const branchService = require("../db/branchService");
const supplierService = require("../db/supplierService");
const bankAccountService = require("../db/backAccountService");

// Existing additional services
const transferService = require("../db/transferService");
const priceBookService = require("../db/priceBookService");
const purchaseOrderService = require("../db/purchaseOrderService");
const receiptService = require("../db/receiptService");
const returnService = require("../db/returnService");
const surchargeService = require("../db/surchargeService");

// NEW MISSING SERVICES
const inventoryAdjustmentService = require("../db/inventoryAdjustmentService");
const damageReportService = require("../db/damageReportService");

// Existing schedulers
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
  categoryScheduler,
  categorySchedulerCurrent,
} = require("../../scheduler/categoryScheduler");

const {
  branchScheduler,
  branchSchedulerCurrent,
} = require("../../scheduler/branchScheduler");

const {
  supplierScheduler,
  supplierSchedulerCurrent,
} = require("../../scheduler/supplierScheduler");

const {
  bankAccountScheduler,
  bankAccountSchedulerCurrent,
} = require("../../scheduler/bankAccountScheduler");

// Existing additional schedulers
const {
  transferScheduler,
  transferSchedulerCurrent,
} = require("../../scheduler/transferScheduler");

const {
  priceBookScheduler,
  priceBookSchedulerCurrent,
} = require("../../scheduler/priceBookScheduler");

const {
  purchaseOrderScheduler,
  purchaseOrderSchedulerCurrent,
} = require("../../scheduler/purchaseOrderScheduler");

const {
  receiptScheduler,
  receiptSchedulerCurrent,
} = require("../../scheduler/receiptScheduler");

const {
  returnScheduler,
  returnSchedulerCurrent,
} = require("../../scheduler/returnScheduler");

const {
  surchargeScheduler,
  surchargeSchedulerCurrent,
} = require("../../scheduler/surchargeScheduler");

// NEW MISSING SCHEDULERS
const {
  inventoryAdjustmentScheduler,
  inventoryAdjustmentSchedulerCurrent,
} = require("../../scheduler/inventoryAdjustmentScheduler");

const {
  damageReportScheduler,
  damageReportSchedulerCurrent,
} = require("../../scheduler/damageReportScheduler");

// EXISTING SYNC FUNCTIONS (keep as is)
const runOrderSync = async () => {
  try {
    const syncStatus = await orderService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical orders data sync...");
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
      console.log("Running current orders sync...");
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
      console.log("Starting historical invoices data sync...");
      const result = await invoiceScheduler(160);

      if (result.success) {
        console.log("Historical invoices data has been saved to database");
      } else {
        console.error("Error when saving historical data:", result.error);
      }
    } else {
      console.log("Running current invoices sync...");
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
      console.log("Starting historical products data sync...");
      const result = await productScheduler(160);

      if (result.success) {
        console.log("Historical products data has been saved to database");
      } else {
        console.log("Error when saving historical data:", result.error);
      }
    } else {
      console.log("Running current products sync...");
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
  try {
    const syncStatus = await customerService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical customers data sync...");
      const result = await customerScheduler(160);

      if (result.success) {
        console.log("Historical customers data has been saved to database");
      } else {
        console.error(
          "Error when saving historical customers data:",
          result.error
        );
      }
    } else {
      console.log("Running current customers sync...");
      const currentResult = await customerSchedulerCurrent();

      if (currentResult.success) {
        console.log(`Current customers data has been added`);
      } else {
        console.error(
          "Error when adding current customers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data customers:", error);
  }
};

const runUserSync = async () => {
  try {
    const syncStatus = await userService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical users data sync...");
      const result = await userScheduler(160);

      if (result.success) {
        console.log("Historical users data has been saved to database");
      } else {
        console.error("Error when saving historical users data:", result.error);
      }
    } else {
      console.log("Running current users sync...");
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

const runCategorySync = async () => {
  try {
    const syncStatus = await categoryService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting category sync...");
      const result = await categoryScheduler();

      if (result.success) {
        console.log("Categories data has been saved to database");
      } else {
        console.error("Error when saving categories data:", result.error);
      }
    } else {
      console.log("Running current categories sync...");
      const currentResult = await categorySchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current categories data has been added: ${currentResult.savedCount} categories`
        );
      } else {
        console.error(
          "Error when adding current categories:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data categories:", error);
  }
};

const runBranchSync = async () => {
  try {
    const syncStatus = await branchService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting branch sync...");
      const result = await branchScheduler();

      if (result.success) {
        console.log("Branches data has been saved to database");
      } else {
        console.error("Error when saving branches data:", result.error);
      }
    } else {
      console.log("Running current branches sync...");
      const currentResult = await branchSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current branches data has been added: ${currentResult.savedCount} branches`
        );
      } else {
        console.error(
          "Error when adding current branches:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data branches:", error);
  }
};

const runSupplierSync = async () => {
  try {
    const syncStatus = await supplierService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting supplier sync...");
      const result = await supplierScheduler();

      if (result.success) {
        console.log("Suppliers data has been saved to database");
      } else {
        console.error("Error when saving suppliers data:", result.error);
      }
    } else {
      console.log("Running current suppliers sync...");
      const currentResult = await supplierSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current suppliers data has been added: ${currentResult.savedCount} suppliers`
        );
      } else {
        console.error(
          "Error when adding current suppliers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data suppliers:", error);
  }
};

const runBankAccountSync = async () => {
  try {
    const syncStatus = await bankAccountService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting bank account sync...");
      const result = await bankAccountScheduler();

      if (result.success) {
        console.log("Bank accounts data has been saved to database");
      } else {
        console.error("Error when saving bank accounts data:", result.error);
      }
    } else {
      console.log("Running current bank accounts sync...");
      const currentResult = await bankAccountSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current bank accounts data has been added: ${currentResult.savedCount} bank accounts`
        );
      } else {
        console.error(
          "Error when adding current bank accounts:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data bank accounts:", error);
  }
};

// EXISTING ADDITIONAL SYNC FUNCTIONS

const runTransferSync = async () => {
  try {
    const syncStatus = await transferService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical transfers data sync...");
      const result = await transferScheduler(160);

      if (result.success) {
        console.log("Historical transfers data has been saved to database");
      } else {
        console.error(
          "Error when saving historical transfers data:",
          result.error
        );
      }
    } else {
      console.log("Running current transfers sync...");
      const currentResult = await transferSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current transfers data has been added: ${currentResult.savedCount} transfers`
        );
      } else {
        console.error(
          "Error when adding current transfers:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data transfers:", error);
  }
};

const runPriceBookSync = async () => {
  try {
    const syncStatus = await priceBookService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting price book sync...");
      const result = await priceBookScheduler();

      if (result.success) {
        console.log("Price books data has been saved to database");
      } else {
        console.error("Error when saving price books data:", result.error);
      }
    } else {
      console.log("Running current price books sync...");
      const currentResult = await priceBookSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current price books data has been added: ${currentResult.savedCount} price books`
        );
      } else {
        console.error(
          "Error when adding current price books:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data price books:", error);
  }
};

const runPurchaseOrderSync = async () => {
  try {
    const syncStatus = await purchaseOrderService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical purchase orders data sync...");
      const result = await purchaseOrderScheduler(160);

      if (result.success) {
        console.log(
          "Historical purchase orders data has been saved to database"
        );
      } else {
        console.error(
          "Error when saving historical purchase orders data:",
          result.error
        );
      }
    } else {
      console.log("Running current purchase orders sync...");
      const currentResult = await purchaseOrderSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current purchase orders data has been added: ${currentResult.savedCount} purchase orders`
        );
      } else {
        console.error(
          "Error when adding current purchase orders:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data purchase orders:", error);
  }
};

const runReceiptSync = async () => {
  try {
    const syncStatus = await receiptService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting receipt sync...");
      const result = await receiptScheduler();

      if (result.success) {
        console.log("Receipts data has been saved to database");
      } else {
        console.error("Error when saving receipts data:", result.error);
      }
    } else {
      console.log("Running current receipts sync...");
      const currentResult = await receiptSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current receipts data has been added: ${currentResult.savedCount} receipts`
        );
      } else {
        console.error(
          "Error when adding current receipts:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data receipts:", error);
  }
};

const runReturnSync = async () => {
  try {
    const syncStatus = await returnService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting return sync...");
      const result = await returnScheduler();

      if (result.success) {
        console.log("Returns data has been saved to database");
      } else {
        console.error("Error when saving returns data:", result.error);
      }
    } else {
      console.log("Running current returns sync...");
      const currentResult = await returnSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current returns data has been added: ${currentResult.savedCount} returns`
        );
      } else {
        console.error(
          "Error when adding current returns:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data returns:", error);
  }
};

const runSurchargeSync = async () => {
  try {
    const syncStatus = await surchargeService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting surcharge sync...");
      const result = await surchargeScheduler();

      if (result.success) {
        console.log("Surcharges data has been saved to database");
      } else {
        console.error("Error when saving surcharges data:", result.error);
      }
    } else {
      console.log("Running current surcharges sync...");
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

// NEW MISSING SYNC FUNCTIONS

const runInventoryAdjustmentSync = async () => {
  try {
    const syncStatus = await inventoryAdjustmentService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical inventory adjustments data sync...");
      const result = await inventoryAdjustmentScheduler(160);

      if (result.success) {
        console.log(
          "Historical inventory adjustments data has been saved to database"
        );
      } else {
        console.error(
          "Error when saving historical inventory adjustments data:",
          result.error
        );
      }
    } else {
      console.log("Running current inventory adjustments sync...");
      const currentResult = await inventoryAdjustmentSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current inventory adjustments data has been added: ${currentResult.savedCount} adjustments`
        );
      } else {
        console.error(
          "Error when adding current inventory adjustments:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data inventory adjustments:", error);
  }
};

const runDamageReportSync = async () => {
  try {
    const syncStatus = await damageReportService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      console.log("Starting historical damage reports data sync...");
      const result = await damageReportScheduler(160);

      if (result.success) {
        console.log(
          "Historical damage reports data has been saved to database"
        );
      } else {
        console.error(
          "Error when saving historical damage reports data:",
          result.error
        );
      }
    } else {
      console.log("Running current damage reports sync...");
      const currentResult = await damageReportSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current damage reports data has been added: ${currentResult.savedCount} reports`
        );
      } else {
        console.error(
          "Error when adding current damage reports:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data damage reports:", error);
  }
};

module.exports = {
  // Existing functions
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  runCategorySync,
  runBranchSync,
  runSupplierSync,
  runBankAccountSync,
  // Existing additional functions
  runTransferSync,
  runPriceBookSync,
  runPurchaseOrderSync,
  runReceiptSync,
  runReturnSync,
  runSurchargeSync,
  // NEW missing functions
  runInventoryAdjustmentSync,
  runDamageReportSync,
};
