// scheduler/surchargeScheduler.js
const { getSurcharges } = require("../src/kiotviet");
const surchargeService = require("../src/db/surchargeService");

const surchargeSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current surcharges (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentSurcharges = await getSurcharges();

      if (
        currentSurcharges &&
        currentSurcharges.data &&
        Array.isArray(currentSurcharges.data)
      ) {
        if (currentSurcharges.data.length === 0) {
          console.log("No new surcharges to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentSurcharges.data.length} surcharges...`
        );
        const result = await surchargeService.saveSurcharges(
          currentSurcharges.data
        );

        await surchargeService.updateSyncStatus(true, new Date());

        console.log(
          `Surcharge sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Surcharge sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Surcharge sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// For now, surcharges only support current sync since getSurchargesByDate is not implemented in KiotViet API
const surchargeScheduler = async () => {
  try {
    console.log("Starting surcharge sync...");
    const result = await surchargeSchedulerCurrent();

    if (result.success) {
      console.log("Surcharges sync completed successfully");
    } else {
      console.error("Error when syncing surcharges:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync surcharges:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  surchargeScheduler,
  surchargeSchedulerCurrent,
};
