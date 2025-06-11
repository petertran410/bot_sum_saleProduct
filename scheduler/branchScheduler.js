const { getBranches, getBranchesByDate } = require("../src/kiotviet");
const branchService = require("../src/db/branchService");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
} = require("../saveData/saveData");

const branchScheduler = async (daysAgo) => {
  try {
    const branchesByDate = await getBranchesByDate(daysAgo);

    let totalSaved = 0;

    for (const dateData of branchesByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const result = await branchService.saveBranches(dateData.data.data);
        totalSaved += result.stats.success;

        if (dateData.data.data.length > 0) {
          await appendJsonDataToFile(
            {
              date: dateData.date,
              data: dateData.data.data,
            },
            "saveJson",
            "branches.json"
          );
        }

        console.log(
          `Saved ${result.stats.success} branches from ${dateData.date}`
        );
      }
    }

    await branchService.updateSyncStatus(true, new Date());

    console.log(`Historical branches data saved: ${totalSaved} branches total`);

    return {
      success: true,
      message: `Saved ${totalSaved} branches from historical data`,
    };
  } catch (error) {
    console.log("Cannot create branchSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const branchSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🎯 Fetching time-filtered branches (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentBranches = await getBranches(); // Now uses time-filtering!

      if (
        currentBranches &&
        currentBranches.data &&
        Array.isArray(currentBranches.data)
      ) {
        if (currentBranches.data.length === 0) {
          console.log("✅ No branches modified in last 48 hours");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `🚀 Processing ${currentBranches.data.length} time-filtered branches...`
        );
        const result = await branchService.saveBranches(currentBranches.data);

        await branchService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Time-filtered branch sync: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Time-filtered branch sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error(
          "💥 Max retries reached. Time-filtered branch sync failed."
        );
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

module.exports = {
  branchScheduler,
  branchSchedulerCurrent,
};
