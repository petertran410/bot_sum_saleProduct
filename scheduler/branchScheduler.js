const { getBranches } = require("../src/kiotviet");
const branchService = require("../src/db/branchService");

const branchSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current branches (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentBranches = await getBranches();

      if (
        currentBranches &&
        currentBranches.data &&
        Array.isArray(currentBranches.data)
      ) {
        if (currentBranches.data.length === 0) {
          console.log("No new branches to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentBranches.data.length} branches...`);
        const result = await branchService.saveBranches(currentBranches.data);

        await branchService.updateSyncStatus(true, new Date());

        console.log(
          `Branch sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
      console.error(`Branch sync attempt ${retryCount} failed:`, error.message);

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Branch sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Branches don't change frequently, so we only sync current data
const branchScheduler = async () => {
  try {
    console.log("Starting branch sync...");
    const result = await branchSchedulerCurrent();

    if (result.success) {
      console.log("Branches sync completed successfully");
    } else {
      console.error("Error when syncing branches:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync branches:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  branchScheduler,
  branchSchedulerCurrent,
};
