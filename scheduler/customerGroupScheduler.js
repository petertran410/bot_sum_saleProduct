const { getCustomerGroups } = require("../src/kiotviet");
const customerGroupService = require("../src/db/customerGroupService");

const customerGroupSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current customer groups (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentCustomerGroups = await getCustomerGroups();

      if (
        currentCustomerGroups &&
        currentCustomerGroups.data &&
        Array.isArray(currentCustomerGroups.data)
      ) {
        if (currentCustomerGroups.data.length === 0) {
          console.log("No new customer groups to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentCustomerGroups.data.length} customer groups...`
        );
        const result = await customerGroupService.saveCustomerGroups(
          currentCustomerGroups.data
        );

        await customerGroupService.updateSyncStatus(true, new Date());

        console.log(
          `Customer group sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Customer group sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Customer group sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const customerGroupScheduler = async () => {
  try {
    console.log("Starting customer group sync...");
    const result = await customerGroupSchedulerCurrent();

    if (result.success) {
      console.log("Customer groups sync completed successfully");
    } else {
      console.error("Error when syncing customer groups:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync customer groups:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  customerGroupScheduler,
  customerGroupSchedulerCurrent,
};
