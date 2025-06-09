const {
  getPurchaseOrders,
  getPurchaseOrdersByDate,
} = require("../src/kiotviet");
const purchaseOrderService = require("../src/db/purchaseOrderService");

const purchaseOrderSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current purchase orders (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const currentPurchaseOrders = await getPurchaseOrders();

      if (
        currentPurchaseOrders &&
        currentPurchaseOrders.data &&
        Array.isArray(currentPurchaseOrders.data)
      ) {
        if (currentPurchaseOrders.data.length === 0) {
          console.log("No new purchase orders to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentPurchaseOrders.data.length} purchase orders...`
        );

        const result = await purchaseOrderService.savePurchaseOrders(
          currentPurchaseOrders.data
        );

        await purchaseOrderService.updateSyncStatus(true, new Date());

        console.log(
          `Purchase order sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Purchase order sync attempt ${retryCount} failed:`,
        error.message
      );

      // Enhanced error logging for 400 errors
      if (error.response?.status === 400) {
        console.error("Detailed 400 error analysis:");
        console.error("- This usually indicates invalid request parameters");
        console.error("- Check date formats and API parameter names");
        console.error("- Verify API endpoint availability");
      }

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Purchase order sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const purchaseOrderScheduler = async (daysAgo) => {
  try {
    const purchaseOrdersByDate = await getPurchaseOrdersByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of purchaseOrdersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} purchase orders from ${dateData.date}`
        );
        const result = await purchaseOrderService.savePurchaseOrders(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      }
    }

    await purchaseOrderService.updateSyncStatus(true, new Date());
    console.log(
      `Historical purchase orders data saved: ${totalSaved} purchase orders total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} purchase orders from historical data`,
    };
  } catch (error) {
    console.error("Cannot create purchaseOrderSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  purchaseOrderScheduler,
  purchaseOrderSchedulerCurrent,
};
