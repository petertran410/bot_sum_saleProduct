const { getCategories } = require("../src/kiotviet");
const categoryService = require("../src/db/categoryService");

const categorySchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current categories (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentCategories = await getCategories();

      if (
        currentCategories &&
        currentCategories.data &&
        Array.isArray(currentCategories.data)
      ) {
        if (currentCategories.data.length === 0) {
          console.log("No new categories to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentCategories.data.length} categories...`
        );
        const result = await categoryService.saveCategories(
          currentCategories.data
        );

        await categoryService.updateSyncStatus(true, new Date());

        console.log(
          `Category sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Category sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Category sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Categories don't change frequently, so we only sync current data
const categoryScheduler = async () => {
  try {
    console.log("Starting category sync...");
    const result = await categorySchedulerCurrent();

    if (result.success) {
      console.log("Categories sync completed successfully");
    } else {
      console.error("Error when syncing categories:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync categories:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  categoryScheduler,
  categorySchedulerCurrent,
};
