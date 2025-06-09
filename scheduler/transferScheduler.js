const { getTransfers, getTransfersByDate } = require("../src/kiotviet");
const transferService = require("../src/db/transferService");

const transferSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current transfers (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentTransfers = await getTransfers();

      if (
        currentTransfers &&
        currentTransfers.data &&
        Array.isArray(currentTransfers.data)
      ) {
        if (currentTransfers.data.length === 0) {
          console.log("No new transfers to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentTransfers.data.length} transfers...`);
        const result = await transferService.saveTransfers(
          currentTransfers.data
        );

        await transferService.updateSyncStatus(true, new Date());

        console.log(
          `Transfer sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Transfer sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Transfer sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const transferScheduler = async (daysAgo) => {
  try {
    const transfersByDate = await getTransfersByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of transfersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} transfers from ${dateData.date}`
        );
        const result = await transferService.saveTransfers(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await transferService.updateSyncStatus(true, new Date());
    console.log(
      `Historical transfers data saved: ${totalSaved} transfers total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} transfers from historical data`,
    };
  } catch (error) {
    console.error("Cannot create transferSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  transferScheduler,
  transferSchedulerCurrent,
};
