const {
  getCustomerGroups,
  getCustomerGroupsByDate,
} = require("../src/kiotviet");
const customerGroupService = require("../src/db/customerGroupService");

const customerGroupSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const currentCustomerGroups = await getCustomerGroups();

      if (
        currentCustomerGroups &&
        currentCustomerGroups.data &&
        Array.isArray(currentCustomerGroups.data)
      ) {
        if (currentCustomerGroups.data.length === 0) {
          return { success: true, savedCount: 0, hasNewData: false };
        }

        const result = await customerGroupService.saveCustomerGroups(
          currentCustomerGroups.data
        );

        await customerGroupService.updateSyncStatus(true, new Date());

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

const customerGroupScheduler = async (daysAgo) => {
  try {
    const customerGroupsByDate = await getCustomerGroupsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of customerGroupsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const result = await customerGroupService.saveCustomerGroups(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      }
    }

    await customerGroupService.updateSyncStatus(true, new Date());

    return {
      success: true,
      message: `Saved ${totalSaved} customer groups from historical data`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  customerGroupScheduler,
  customerGroupSchedulerCurrent,
};
