const {
  getProductOnHands,
  getProductOnHandsByDate,
} = require("../src/kiotviet");
const productOnHandsService = require("../src/db/productOnHandsService");

const productOnHandsScheduler = async (daysAgo) => {
  try {
    const productOnHandsByDate = await getProductOnHandsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of productOnHandsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const result = await productOnHandsService.saveProductOnHands(
          dateData.data.data
        );
        totalSaved += result.stats.success;

        console.log(
          `Saved ${result.stats.success} productOnHands from ${dateData.date}`
        );
      }
    }

    await productOnHandsService.updateSyncStatus(true, new Date());

    console.log(
      `Historical productOnHands data saved: ${totalSaved} items total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} productOnHands from historical data`,
    };
  } catch (error) {
    console.log("Cannot create productOnHandsSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const productOnHandsSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🎯 Fetching time-filtered productOnHands (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const currentProductOnHands = await getProductOnHands(); // Uses time-filtering!

      if (
        currentProductOnHands &&
        currentProductOnHands.data &&
        Array.isArray(currentProductOnHands.data)
      ) {
        if (currentProductOnHands.data.length === 0) {
          console.log("✅ No productOnHands modified in last 48 hours");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `🚀 Processing ${currentProductOnHands.data.length} time-filtered productOnHands...`
        );
        const result = await productOnHandsService.saveProductOnHands(
          currentProductOnHands.data
        );

        await productOnHandsService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Time-filtered productOnHands sync: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Time-filtered productOnHands sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error(
          "💥 Max retries reached. Time-filtered productOnHands sync failed."
        );
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

module.exports = {
  productOnHandsScheduler,
  productOnHandsSchedulerCurrent,
};
