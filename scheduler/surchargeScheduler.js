const { getSurcharges, getSurchargesByDate } = require("../src/kiotviet");
const surchargeService = require("../src/db/surchagesService");

const surchargeSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
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

        const result = await surchargeService.saveSurcharges(
          currentSurcharges.data
        );

        await surchargeService.updateSyncStatus(true, new Date());

        return {
          success: true,
          savedCount: result.stats.newRecords,
          hasNewData: result.stats.newRecords > 0,
        };
      }

      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const surchargeScheduler = async (daysAgo) => {
  try {
    const surchargesByDate = await getSurchargesByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of surchargesByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const result = await surchargeService.saveSurcharges(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      }
    }

    await surchargeService.updateSyncStatus(true, new Date());

    return {
      success: true,
      message: `Saved ${totalSaved} surcharges from historical data`,
    };
  } catch (error) {
    console.error("Cannot create surchargeSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  surchargeScheduler,
  surchargeSchedulerCurrent,
};
