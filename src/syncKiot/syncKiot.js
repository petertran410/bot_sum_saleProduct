const orderService = require("../db/orderService");
const invoiceService = require("../db/invoiceService");
const productService = require("../db/productService");
const customerService = require("../db/customerService");
const userService = require("../db/userService");

// New services
const categoryService = require("../db/categoryService");
const branchService = require("../db/branchService");
const supplierService = require("../db/supplierService");
const bankAccountService = require("../db/backAccountService");

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

// New schedulers
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

// NEW SYNC FUNCTIONS

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

module.exports = {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  // New sync functions
  runCategorySync,
  runBranchSync,
  runSupplierSync,
  runBankAccountSync,
};
