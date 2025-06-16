// scheduler/customerLarkScheduler.js
const { getCustomers, getCustomersByDate } = require("../src/kiotviet");
const {
  syncCustomersToLarkBaseOptimized,
  syncCustomersToLarkBase,
  sendLarkSyncNotification,
} = require("../src/lark/customerLarkService");

/**
 * Sync current customers from KiotViet to Lark Base
 * This function fetches recent customer data and syncs to Lark
 */
const customerLarkSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching current customers for Lark sync (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      // Use existing KiotViet API function to get current customers
      const currentCustomers = await getCustomers();

      if (
        currentCustomers &&
        currentCustomers.data &&
        Array.isArray(currentCustomers.data)
      ) {
        if (currentCustomers.data.length === 0) {
          console.log("✅ No new customers to sync to Lark");
          await sendLarkSyncNotification(
            {
              total: 0,
              newRecords: 0,
              updated: 0,
              failed: 0,
            },
            "current"
          );

          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `📊 Processing ${currentCustomers.data.length} customers for Lark sync...`
        );

        // Sync to Lark Base
        // const larkResult = await syncCustomersToLarkBase(currentCustomers.data);

        const larkResult = await syncCustomersToLarkBaseOptimized(
          currentCustomers.data
        );

        // Send notification about sync completion
        await sendLarkSyncNotification(larkResult.stats, "current");

        console.log(
          `✅ Customer Lark sync completed: ${larkResult.stats.success} processed, ${larkResult.stats.newRecords} new, ${larkResult.stats.updated} updated`
        );

        return {
          success: larkResult.success,
          savedCount: larkResult.stats.newRecords,
          hasNewData: larkResult.stats.newRecords > 0,
          stats: larkResult.stats,
        };
      }

      console.log("✅ No customer data available for Lark sync");
      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;
      console.error(
        `❌ Customer Lark sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Customer Lark sync failed.");

        // Send failure notification
        await sendLarkSyncNotification(
          {
            total: 0,
            newRecords: 0,
            updated: 0,
            failed: 1,
            error: error.message,
          },
          "current-failed"
        );

        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

/**
 * Sync historical customers from KiotViet to Lark Base
 * This function processes customers from the past N days
 */
const customerLarkScheduler = async (daysAgo) => {
  try {
    console.log(
      `🚀 Starting historical customer Lark sync for past ${daysAgo} days...`
    );

    const customersByDate = await getCustomersByDate(daysAgo);
    let totalSynced = 0;
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalUpdated = 0;

    for (const dateData of customersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data) &&
        dateData.data.data.length > 0
      ) {
        console.log(
          `📅 Processing ${dateData.data.data.length} customers from ${dateData.date}...`
        );

        const larkResult = await syncCustomersToLarkBase(dateData.data.data);

        totalProcessed += larkResult.stats.total;
        totalSynced += larkResult.stats.newRecords;
        totalUpdated += larkResult.stats.updated || 0;
        totalFailed += larkResult.stats.failed;

        console.log(
          `✅ Date ${dateData.date}: ${larkResult.stats.newRecords} new, ${
            larkResult.stats.updated || 0
          } updated, ${larkResult.stats.failed} failed`
        );

        // Small delay between date batches
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.log(`📅 No customers found for ${dateData.date}`);
      }
    }

    const finalStats = {
      total: totalProcessed,
      newRecords: totalSynced,
      updated: totalUpdated,
      failed: totalFailed,
    };

    // Send completion notification
    await sendLarkSyncNotification(finalStats, `historical-${daysAgo}days`);

    console.log(
      `🎉 Historical customer Lark sync completed: ${totalSynced} new customers, ${totalUpdated} updated, ${totalFailed} failed from ${daysAgo} days of data`
    );

    return {
      success: totalFailed === 0,
      message: `Synced ${totalSynced} new customers to Lark from historical data (${daysAgo} days)`,
      stats: finalStats,
    };
  } catch (error) {
    console.error("❌ Historical customer Lark sync failed:", error.message);

    // Send failure notification
    await sendLarkSyncNotification(
      {
        total: 0,
        newRecords: 0,
        updated: 0,
        failed: 1,
        error: error.message,
      },
      "historical-failed"
    );

    return { success: false, error: error.message };
  }
};

/**
 * Manual trigger for immediate customer sync to Lark
 * Can be called from API endpoints or admin interface
 */
const triggerManualCustomerLarkSync = async (options = {}) => {
  try {
    const { daysAgo = 1, forceFullSync = false, specificDate = null } = options;

    console.log(
      `🔧 Manual customer Lark sync triggered with options:`,
      options
    );

    let result;

    if (forceFullSync) {
      result = await customerLarkScheduler(daysAgo);
    } else {
      result = await customerLarkSchedulerCurrent();
    }

    return {
      success: result.success,
      message: `Manual sync completed: ${result.message || "Sync finished"}`,
      stats: result.stats,
      triggered: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Manual customer Lark sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      triggered: new Date().toISOString(),
    };
  }
};

module.exports = {
  customerLarkScheduler,
  customerLarkSchedulerCurrent,
  triggerManualCustomerLarkSync,
};
