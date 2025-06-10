// scheduler/returnScheduler.js
const { getReturns, getReturnsByDate } = require("../src/kiotviet");
const returnService = require("../src/db/returnService");

const returnSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching current returns (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
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

        console.log(`📦 Processing ${currentReturns.data.length} returns...`);
        const result = await returnService.saveReturns(currentReturns.data);

        await returnService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Returns sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Returns sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Returns sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const returnScheduler = async (daysAgo) => {
  try {
    const returnsByDate = await getReturnsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of returnsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `📦 Processing ${dateData.data.data.length} returns from ${dateData.date}`
        );
        const result = await returnService.saveReturns(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await returnService.updateSyncStatus(true, new Date());
    console.log(
      `✅ Historical returns data saved: ${totalSaved} returns total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} returns from historical data`,
    };
  } catch (error) {
    console.error("❌ Cannot create returnSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  returnScheduler,
  returnSchedulerCurrent,
};
