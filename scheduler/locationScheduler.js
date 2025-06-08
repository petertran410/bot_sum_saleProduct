const { getLocations } = require("../src/kiotviet");
const locationService = require("../src/db/locationService");

const locationSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current locations (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentLocations = await getLocations();

      if (
        currentLocations &&
        currentLocations.data &&
        Array.isArray(currentLocations.data)
      ) {
        if (currentLocations.data.length === 0) {
          console.log("No new locations to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentLocations.data.length} locations...`);
        const result = await locationService.saveLocations(
          currentLocations.data
        );

        await locationService.updateSyncStatus(true, new Date());

        console.log(
          `Location sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Location sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Location sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const locationScheduler = async () => {
  try {
    console.log("Starting location sync...");
    const result = await locationSchedulerCurrent();

    if (result.success) {
      console.log("Locations sync completed successfully");
    } else {
      console.error("Error when syncing locations:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync locations:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  locationScheduler,
  locationSchedulerCurrent,
};
