const {
  checkHistoricalDataStatus,
  checkInvoicesHistoricalDataStatus,
  markHistoricalDataCompleted,
  markInvoicesHistoricalDataCompleted,
} = require("../checkHistoryData/checkData");

const {
  orderScheduler,
  orderSchedulerCurrent,
} = require("../../scheduler/orderScheduler");

const {
  invoiceScheduler,
  invoiceSchedulerCurrent,
} = require("../../scheduler/invoiceScheduler");

const runOrderSync = async () => {
  try {
    const historicalDataCompleted = checkHistoricalDataStatus();

    if (!historicalDataCompleted) {
      const result = await orderScheduler(160);

      if (result.success) {
        markHistoricalDataCompleted();

        console.log("Historical orders data has been saved");
      } else {
        console.error("Error when saving historical data:", result.error);
      }
    } else {
      const currentResult = await orderSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current orders data has been added: ${currentResult.data.length} orders`
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
    const historicalInvoicesDataCompleted = checkInvoicesHistoricalDataStatus();

    if (!historicalInvoicesDataCompleted) {
      const result = await invoiceScheduler(160);

      if (result.success) {
        markInvoicesHistoricalDataCompleted();

        console.log("Historical invoices data has been saved");
      } else {
        console.error("Error when saving historical data:", result.error);
      }
    } else {
      const currentResult = await invoiceSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current invoices data has been added: ${currentResult.data.length} orders`
        );
      } else {
        console.error("Error when adding current orders:", currentResult.error);
      }
    }
  } catch (error) {
    console.error("Cannot get and save data orders:", error);
  }
};

module.exports = {
  runOrderSync,
  runInvoiceSync,
};
