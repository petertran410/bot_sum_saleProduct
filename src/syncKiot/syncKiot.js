const orderService = require("../db/orderService");
const invoiceService = require("../db/invoiceService");
const productService = require("../db/productService");
const customerService = require("../db/customerService");
const userService = require("../db/userService");
const customerGroupService = require("../db/customerGroupService");

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
  customerGroupScheduler,
  customerGroupSchedulerCurrent,
} = require("../../scheduler/customerGroupScheduler");

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
  try {
    const syncStatus = await customerService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
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

const runCustomerGroupSync = async () => {
  try {
    const syncStatus = await customerGroupService.getSyncStatus();

    if (!syncStatus.historicalCompleted) {
      const result = await customerGroupScheduler(160);

      if (result.success) {
        console.log(
          "Historical customer groups data has been saved to database"
        );
      } else {
        console.error(
          "Error when saving historical customer groups data:",
          result.error
        );
      }
    } else {
      const currentResult = await customerGroupSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current customer groups data has been added: ${currentResult.savedCount} customer groups`
        );
      } else {
        console.error(
          "Error when adding current customer groups:",
          currentResult.error
        );
      }
    }
  } catch (error) {
    console.error("Cannot get and save data customer groups:", error);
  }
};

module.exports = {
  runOrderSync,
  runInvoiceSync,
  runProductSync,
  runCustomerSync,
  runUserSync,
  runCustomerGroupSync,
};
