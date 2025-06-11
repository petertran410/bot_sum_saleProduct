const { getSaleChannels } = require("../src/kiotviet");
const salechannelService = require("../src/db/salechannelService");

const salechannelSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching current sale channels (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const currentSaleChannels = await getSaleChannels();

      if (
        currentSaleChannels &&
        currentSaleChannels.data &&
        Array.isArray(currentSaleChannels.data)
      ) {
        if (currentSaleChannels.data.length === 0) {
          console.log("No sale channels to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `📦 Processing ${currentSaleChannels.data.length} sale channels...`
        );
        const result = await salechannelService.saveSaleChannels(
          currentSaleChannels.data
        );

        await salechannelService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Sale channel sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Sale channel sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Sale channel sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

module.exports = {
  salechannelSchedulerCurrent,
};
