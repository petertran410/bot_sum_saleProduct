// scheduler/inventoryAdjustmentScheduler.js - NEW SCHEDULER
const {
  getInventoryAdjustments,
  getInventoryAdjustmentsByDate,
} = require("../src/kiotviet");
const inventoryAdjustmentService = require("../src/db/inventoryAdjustmentService");

const inventoryAdjustmentSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current inventory adjustments (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentAdjustments = await getInventoryAdjustments();

      if (
        currentAdjustments &&
        currentAdjustments.data &&
        Array.isArray(currentAdjustments.data)
      ) {
        if (currentAdjustments.data.length === 0) {
          console.log("No new inventory adjustments to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentAdjustments.data.length} inventory adjustments...`
        );
        const result =
          await inventoryAdjustmentService.saveInventoryAdjustments(
            currentAdjustments.data
          );

        await inventoryAdjustmentService.updateSyncStatus(true, new Date());

        console.log(
          `Inventory adjustment sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Inventory adjustment sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Inventory adjustment sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const inventoryAdjustmentScheduler = async (daysAgo) => {
  try {
    const adjustmentsByDate = await getInventoryAdjustmentsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of adjustmentsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} inventory adjustments from ${dateData.date}`
        );
        const result =
          await inventoryAdjustmentService.saveInventoryAdjustments(
            dateData.data.data
          );
        totalSaved += result.stats.success;
      }
    }

    await inventoryAdjustmentService.updateSyncStatus(true, new Date());
    console.log(
      `Historical inventory adjustments data saved: ${totalSaved} adjustments total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} inventory adjustments from historical data`,
    };
  } catch (error) {
    console.error("Cannot create inventoryAdjustmentSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  inventoryAdjustmentScheduler,
  inventoryAdjustmentSchedulerCurrent,
};
