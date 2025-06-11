const { getTrademarks } = require("../src/kiotviet");
const trademarkService = require("../src/db/trademarkService");

const trademarkSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching trademarks (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );

      const allTrademarks = await getTrademarks();

      if (
        allTrademarks &&
        allTrademarks.data &&
        Array.isArray(allTrademarks.data)
      ) {
        if (allTrademarks.data.length === 0) {
          console.log("No trademarks found");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`📦 Processing ${allTrademarks.data.length} trademarks...`);

        // Log sample trademark structure for debugging
        if (allTrademarks.data.length > 0) {
          const sample = allTrademarks.data[0];
          console.log("🔍 Sample trademark structure:", {
            tradeMarkId: sample.tradeMarkId,
            tradeMarkName: sample.tradeMarkName,
            createdDate: sample.createdDate,
            modifiedDate: sample.modifiedDate,
          });
        }

        const result = await trademarkService.saveTrademarks(
          allTrademarks.data
        );

        await trademarkService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Trademark sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Trademark sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Trademark sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const trademarkScheduler = async (daysAgo) => {
  console.log(
    `ℹ️  Trademarks are reference data without date filtering. Running full sync...`
  );
  return await trademarkSchedulerCurrent();
};

module.exports = {
  trademarkScheduler,
  trademarkSchedulerCurrent,
};
