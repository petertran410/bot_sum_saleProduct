// scheduler/damageReportScheduler.js - NEW SCHEDULER
const { getDamageReports, getDamageReportsByDate } = require("../src/kiotviet");
const damageReportService = require("../src/db/damageReportService");

const damageReportSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current damage reports (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentDamageReports = await getDamageReports();

      if (
        currentDamageReports &&
        currentDamageReports.data &&
        Array.isArray(currentDamageReports.data)
      ) {
        if (currentDamageReports.data.length === 0) {
          console.log("No new damage reports to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentDamageReports.data.length} damage reports...`
        );
        const result = await damageReportService.saveDamageReports(
          currentDamageReports.data
        );

        await damageReportService.updateSyncStatus(true, new Date());

        console.log(
          `Damage report sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Damage report sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Damage report sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const damageReportScheduler = async (daysAgo) => {
  try {
    const damageReportsByDate = await getDamageReportsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of damageReportsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} damage reports from ${dateData.date}`
        );
        const result = await damageReportService.saveDamageReports(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      }
    }

    await damageReportService.updateSyncStatus(true, new Date());
    console.log(
      `Historical damage reports data saved: ${totalSaved} reports total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} damage reports from historical data`,
    };
  } catch (error) {
    console.error("Cannot create damageReportSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  damageReportScheduler,
  damageReportSchedulerCurrent,
};
