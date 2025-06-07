// scheduler/priceBookScheduler.js
const { getPriceBooks } = require("../src/kiotviet");
const priceBookService = require("../src/db/priceBookService");

const priceBookSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current price books (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentPriceBooks = await getPriceBooks();

      if (
        currentPriceBooks &&
        currentPriceBooks.data &&
        Array.isArray(currentPriceBooks.data)
      ) {
        if (currentPriceBooks.data.length === 0) {
          console.log("No new price books to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentPriceBooks.data.length} price books...`
        );
        const result = await priceBookService.savePriceBooks(
          currentPriceBooks.data
        );

        await priceBookService.updateSyncStatus(true, new Date());

        console.log(
          `Price book sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Price book sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Price book sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Price books don't change frequently, so we only sync current data
const priceBookScheduler = async () => {
  try {
    console.log("Starting price book sync...");
    const result = await priceBookSchedulerCurrent();

    if (result.success) {
      console.log("Price books sync completed successfully");
    } else {
      console.error("Error when syncing price books:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync price books:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  priceBookScheduler,
  priceBookSchedulerCurrent,
};
