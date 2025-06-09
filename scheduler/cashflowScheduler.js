const { getCashflow, getCashflowByDate } = require("../src/kiotviet");
const cashflowService = require("../src/db/cashflowService");

const cashflowSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current cashflows (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentCashflows = await getCashflow();

      if (
        currentCashflows &&
        currentCashflows.data &&
        Array.isArray(currentCashflows.data)
      ) {
        if (currentCashflows.data.length === 0) {
          console.log("No new cashflows to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentCashflows.data.length} cashflows...`);
        const result = await cashflowService.saveCashflows(
          currentCashflows.data
        );

        await cashflowService.updateSyncStatus(true, new Date());

        console.log(
          `Cashflow sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Cashflow sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Cashflow sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const cashflowScheduler = async (daysAgo) => {
  try {
    const cashflowsByDate = await getCashflowByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of cashflowsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} cashflows from ${dateData.date}`
        );
        const result = await cashflowService.saveCashflows(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await cashflowService.updateSyncStatus(true, new Date());
    console.log(
      `Historical cashflows data saved: ${totalSaved} cashflows total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} cashflows from historical data`,
    };
  } catch (error) {
    console.error("Cannot create cashflowSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  cashflowScheduler,
  cashflowSchedulerCurrent,
};
