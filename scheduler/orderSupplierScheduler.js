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
        `🚀 Fetching order suppliers (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const allOrderSuppliers = await getOrderSuppliers();

      if (
        allOrderSuppliers &&
        allOrderSuppliers.data &&
        Array.isArray(allOrderSuppliers.data)
      ) {
        if (allOrderSuppliers.data.length === 0) {
          console.log("No order suppliers found");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `📦 Processing ${allOrderSuppliers.data.length} order suppliers...`
        );

        // Log sample order supplier structure for debugging
        if (allOrderSuppliers.data.length > 0) {
          const sample = allOrderSuppliers.data[0];
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
          allOrderSuppliers.data
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

// Since OrderSuppliers API doesn't support date filtering,
// historical sync is the same as current sync
const orderSupplierScheduler = async (daysAgo) => {
  console.log(
    `⚠️  OrderSuppliers API doesn't support historical data by date. Running full sync instead.`
  );
  return await orderSupplierSchedulerCurrent();
};

module.exports = {
  orderSupplierScheduler,
  orderSupplierSchedulerCurrent,
};
