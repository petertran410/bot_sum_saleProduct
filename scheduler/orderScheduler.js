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
  try {
    const currentOrders = await getOrders();

    if (
      currentOrders &&
      currentOrders.data &&
      Array.isArray(currentOrders.data) &&
      currentOrders.data.length > 0
    ) {
      const result = await saveBothJsonAndMySQL(
        currentOrders.data,
        orderService.saveOrders,
        "saveJson",
        "orders.json"
      );

      await orderService.updateSyncStatus(true, new Date());

      console.log(
        `Current orders data saved: ${result.stats.newRecords} new orders out of ${result.stats.success} processed. ${result.stats.savedToJson} saved to JSON.`
      );

      return {
        success: true,
        data: currentOrders.data,
        savedCount: result.stats.newRecords,
        hasNewData: result.stats.newRecords > 0,
      };
    } else {
      console.log("No new orders data to save");
      return {
        success: true,
        data: [],
        savedCount: 0,
        hasNewData: false,
      };
    }
  } catch (error) {
    console.log("Cannot save current orders", error);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

module.exports = {
  orderScheduler,
  orderSchedulerCurrent,
};
