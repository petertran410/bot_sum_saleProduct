const {
  getCustomerGroups,
  getCustomerGroupsByDate,
} = require("../src/kiotviet");
const customerGroupService = require("../src/db/customerGroupService");

const customerGroupSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  console.log("🔄 Starting customer group current sync...");

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `📊 Fetching current customer groups (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const currentCustomerGroups = await getCustomerGroups();

      console.log("API Response:", {
        hasData: !!currentCustomerGroups,
        hasDataArray: !!(currentCustomerGroups && currentCustomerGroups.data),
        dataLength: currentCustomerGroups?.data?.length || 0,
        total: currentCustomerGroups?.total || 0,
      });

      if (
        currentCustomerGroups &&
        currentCustomerGroups.data &&
        Array.isArray(currentCustomerGroups.data)
      ) {
        if (currentCustomerGroups.data.length === 0) {
          console.log("✅ No new customer groups to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `📦 Processing ${currentCustomerGroups.data.length} customer groups...`
        );

        // Log sample data structure
        if (currentCustomerGroups.data.length > 0) {
          console.log(
            "Sample customer group data:",
            JSON.stringify(currentCustomerGroups.data[0], null, 2)
          );
        }

        const result = await customerGroupService.saveCustomerGroups(
          currentCustomerGroups.data
        );

        await customerGroupService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Customer groups sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new, ${result.stats.updated} updated`
        );

        return {
          success: true,
          savedCount: result.stats.newRecords,
          hasNewData: result.stats.newRecords > 0,
        };
      }

      console.log("⚠️ No valid customer groups data received from API");
      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;
      console.error(
        `❌ Customer group sync attempt ${retryCount} failed:`,
        error.message
      );
      console.error("Stack trace:", error.stack);

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("❌ Max retries reached. Customer group sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const customerGroupScheduler = async (daysAgo) => {
  try {
    console.log(
      `🔄 Starting historical customer group sync for ${daysAgo} days...`
    );

    const customerGroupsByDate = await getCustomerGroupsByDate(daysAgo);
    let totalSaved = 0;

    console.log(`📅 Retrieved data for ${customerGroupsByDate.length} days`);

    for (const dateData of customerGroupsByDate) {
      console.log(`📅 Processing date: ${dateData.date}`);

      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `📦 Processing ${dateData.data.data.length} customer groups from ${dateData.date}`
        );

        const result = await customerGroupService.saveCustomerGroups(
          dateData.data.data
        );
        totalSaved += result.stats.success;
      } else if (dateData.data && Array.isArray(dateData.data)) {
        // Handle case where data is directly an array
        console.log(
          `📦 Processing ${dateData.data.length} customer groups from ${dateData.date}`
        );

        const result = await customerGroupService.saveCustomerGroups(
          dateData.data
        );
        totalSaved += result.stats.success;
      } else {
        console.log(`⚠️ No customer groups data for ${dateData.date}`);
      }
    }

    await customerGroupService.updateSyncStatus(true, new Date());

    console.log(
      `✅ Historical customer groups data saved: ${totalSaved} customer groups total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} customer groups from historical data`,
    };
  } catch (error) {
    console.error("❌ Cannot create customerGroupSchedulerByDate:", error);
    console.error("Stack trace:", error.stack);
    return { success: false, error: error.message };
  }
};

module.exports = {
  customerGroupScheduler,
  customerGroupSchedulerCurrent,
};
