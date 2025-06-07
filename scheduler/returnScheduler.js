// scheduler/returnScheduler.js
const { getReturns } = require("../src/kiotviet");
const returnService = require("../src/db/returnService");

const returnSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current returns (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );
      const currentReturns = await getReturns();

      if (
        currentReturns &&
        currentReturns.data &&
        Array.isArray(currentReturns.data)
      ) {
        if (currentReturns.data.length === 0) {
          console.log("No new returns to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentReturns.data.length} returns...`);
        const result = await returnService.saveReturns(currentReturns.data);

        await returnService.updateSyncStatus(true, new Date());

        console.log(
          `Return sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
      console.error(`Return sync attempt ${retryCount} failed:`, error.message);

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Return sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// For now, returns only support current sync since getReturnsByDate is not implemented in KiotViet API
const returnScheduler = async () => {
  try {
    console.log("Starting return sync...");
    const result = await returnSchedulerCurrent();

    if (result.success) {
      console.log("Returns sync completed successfully");
    } else {
      console.error("Error when syncing returns:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync returns:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  returnScheduler,
  returnSchedulerCurrent,
};
