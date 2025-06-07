// scheduler/receiptScheduler.js
const { getReceipts } = require("../src/kiotviet");
const receiptService = require("../src/db/receiptService");

const receiptSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current receipts (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentReceipts = await getReceipts();

      if (
        currentReceipts &&
        currentReceipts.data &&
        Array.isArray(currentReceipts.data)
      ) {
        if (currentReceipts.data.length === 0) {
          console.log("No new receipts to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentReceipts.data.length} receipts...`);
        const result = await receiptService.saveReceipts(currentReceipts.data);

        await receiptService.updateSyncStatus(true, new Date());

        console.log(
          `Receipt sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
        );

        return {
          success: true,
          savedCount: result.stats.newRecords,
          hasNewData: result.stats.newRecords > 0,
        };
      }

      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;
      console.error(
        `Receipt sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Receipt sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// For now, receipts only support current sync since getReceiptsByDate is not implemented in KiotViet API
const receiptScheduler = async () => {
  try {
    console.log("Starting receipt sync...");
    const result = await receiptSchedulerCurrent();

    if (result.success) {
      console.log("Receipts sync completed successfully");
    } else {
      console.error("Error when syncing receipts:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync receipts:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  receiptScheduler,
  receiptSchedulerCurrent,
};
