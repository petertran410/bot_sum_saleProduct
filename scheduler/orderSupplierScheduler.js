const {
  getOrderSuppliers,
  getOrderSuppliersByDate,
} = require("../src/kiotviet");
const orderSupplierService = require("../src/db/orderSupplierService");

const orderSupplierSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching current order suppliers (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const currentOrderSuppliers = await getOrderSuppliers();

      if (
        currentOrderSuppliers &&
        currentOrderSuppliers.data &&
        Array.isArray(currentOrderSuppliers.data)
      ) {
        if (currentOrderSuppliers.data.length === 0) {
          console.log("No new order suppliers to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `📦 Processing ${currentOrderSuppliers.data.length} order suppliers...`
        );

        // Log sample order supplier structure for debugging
        if (currentOrderSuppliers.data.length > 0) {
          const sample = currentOrderSuppliers.data[0];
          console.log("🔍 Sample order supplier structure:", {
            id: sample.id,
            code: sample.code,
            status: sample.status,
            orderDate: sample.orderDate,
            detailsCount: sample.orderSupplierDetails?.length || 0,
            expensesCount: sample.OrderSupplierExpensesOthers?.length || 0,
          });
        }

        const result = await orderSupplierService.saveOrderSuppliers(
          currentOrderSuppliers.data
        );

        await orderSupplierService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Order supplier sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Order supplier sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Order supplier sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const orderSupplierScheduler = async (daysAgo) => {
  try {
    console.log(`📅 Fetching order suppliers from last ${daysAgo} days...`);
    const orderSuppliersByDate = await getOrderSuppliersByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of orderSuppliersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} order suppliers from ${dateData.date}`
        );
        const result = await orderSupplierService.saveOrderSuppliers(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      }
    }

    await orderSupplierService.updateSyncStatus(true, new Date());
    console.log(
      `📊 Historical order suppliers data saved: ${totalSaved} order suppliers total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} order suppliers from historical data`,
    };
  } catch (error) {
    console.error("❌ Cannot create orderSupplierSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  orderSupplierScheduler,
  orderSupplierSchedulerCurrent,
};
