// scheduler/pricebookScheduler.js - EXACTLY like trademarkScheduler.js
const { getPricebooks } = require("../src/kiotviet");
const pricebookService = require("../src/db/pricebookService");

const pricebookSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching pricebooks (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );

      const allPricebooks = await getPricebooks();

      if (
        allPricebooks &&
        allPricebooks.data &&
        Array.isArray(allPricebooks.data)
      ) {
        if (allPricebooks.data.length === 0) {
          console.log("No pricebooks found");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`📦 Processing ${allPricebooks.data.length} pricebooks...`);

        // Log sample pricebook structure for debugging
        if (allPricebooks.data.length > 0) {
          const sample = allPricebooks.data[0];
          console.log("🔍 Sample pricebook structure:", {
            id: sample.id,
            name: sample.name,
            isActive: sample.isActive,
            isGlobal: sample.isGlobal,
            startDate: sample.startDate,
            endDate: sample.endDate,
            branchesCount: sample.priceBookBranches?.length || 0,
            customerGroupsCount: sample.priceBookCustomerGroups?.length || 0,
            usersCount: sample.priceBookUsers?.length || 0,
          });
        }

        const result = await pricebookService.savePricebooks(
          allPricebooks.data
        );

        await pricebookService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Pricebook sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Pricebook sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Pricebook sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Same as trademarks - historical sync is same as current
const pricebookScheduler = async (daysAgo) => {
  console.log(
    `ℹ️  Pricebooks are reference data without date filtering. Running full sync...`
  );
  return await pricebookSchedulerCurrent();
};

module.exports = {
  pricebookScheduler,
  pricebookSchedulerCurrent,
};
