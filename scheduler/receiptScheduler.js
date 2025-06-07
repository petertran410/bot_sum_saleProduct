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

const receiptScheduler = async (daysAgo) => {
  try {
    const receiptsByDate = await require("../src/kiotviet").getReceiptsByDate(
      daysAgo
    );
    let totalSaved = 0;

    for (const dateData of receiptsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} receipts from ${dateData.date}`
        );
        const result = await receiptService.saveReceipts(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await receiptService.updateSyncStatus(true, new Date());
    console.log(`Historical receipts data saved: ${totalSaved} receipts total`);

    return {
      success: true,
      message: `Saved ${totalSaved} receipts from historical data`,
    };
  } catch (error) {
    console.error("Cannot create receiptSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  receiptScheduler,
  receiptSchedulerCurrent,
};
