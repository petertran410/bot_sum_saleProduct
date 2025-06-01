const { getOrders, getOrdersByDate } = require("../src/kiotviet");
const orderService = require("../src/db/orderService");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
} = require("../saveData/saveData");

const orderScheduler = async (daysAgo) => {
  try {
    const ordersByDate = await getOrdersByDate(daysAgo);

    let totalSaved = 0;

    for (const dateData of ordersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const result = await orderService.saveOrders(dateData.data.data);
        totalSaved += result.stats.success;

        if (dateData.data.data.length > 0) {
          await appendJsonDataToFile(
            {
              date: dateData.date,
              data: dateData.data.data,
            },
            "saveJson",
            "orders.json"
          );
        }

        console.log(
          `Saved ${result.stats.success} orders from ${dateData.date}`
        );
      }
    }

    await orderService.updateSyncStatus(true, new Date());

    console.log(`Historical orders data saved: ${totalSaved} orders total`);

    return {
      success: true,
      message: `Saved ${totalSaved} orders from historical data`,
    };
  } catch (error) {
    console.log("Cannot create orderSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const orderSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current orders (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );
      const currentOrders = await getOrders();

      if (
        currentOrders &&
        currentOrders.data &&
        Array.isArray(currentOrders.data)
      ) {
        if (currentOrders.data.length === 0) {
          console.log("No new orders to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentOrders.data.length} orders...`);
        const result = await orderService.saveOrders(currentOrders.data);

        await orderService.updateSyncStatus(true, new Date());

        console.log(
          `Order sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
      console.error(`Order sync attempt ${retryCount} failed:`, error.message);

      if (retryCount < MAX_RETRIES) {
        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Order sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

module.exports = {
  orderScheduler,
  orderSchedulerCurrent,
};
