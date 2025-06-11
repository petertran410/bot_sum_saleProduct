// scheduler/pricebookScheduler.js
const {
  getPricebooks,
  getPricebooksByDate,
  getPricebookDetails,
} = require("../src/kiotviet");
const pricebookService = require("../src/db/pricebookService");

/**
 * Current pricebook sync (time-filtered)
 * Used for ongoing sync after historical data is complete
 */
const pricebookSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching pricebooks (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );

      const allPricebooks = await getPricebooks();

      if (
        allPricebooks &&
        allPricebooks.data &&
        Array.isArray(allPricebooks.data)
      ) {
        if (allPricebooks.data.length === 0) {
          console.log("No pricebooks found");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`📦 Processing ${allPricebooks.data.length} pricebooks...`);

        // Log sample pricebook structure for debugging
        if (allPricebooks.data.length > 0) {
          const sample = allPricebooks.data[0];
          console.log("🔍 Sample pricebook structure:", {
            id: sample.id,
            name: sample.name,
            isActive: sample.isActive,
            isGlobal: sample.isGlobal,
            startDate: sample.startDate,
            endDate: sample.endDate,
            branchesCount: sample.priceBookBranches?.length || 0,
            customerGroupsCount: sample.priceBookCustomerGroups?.length || 0,
            usersCount: sample.priceBookUsers?.length || 0,
          });
        }

        const result = await pricebookService.savePricebooks(
          allPricebooks.data
        );

        // Optional: Sync pricebook details (products and prices) for each pricebook
        // Uncomment if client wants detailed product prices per pricebook
        /*
        for (const pricebook of allPricebooks.data) {
          if (pricebook.isActive) {
            try {
              console.log(`Fetching details for pricebook: ${pricebook.name} (ID: ${pricebook.id})`);
              const pricebookDetails = await getPricebookDetails(pricebook.id);
              
              if (pricebookDetails.data && pricebookDetails.data.length > 0) {
                await pricebookService.savePricebookDetails(pricebook.id, pricebookDetails.data);
              }
            } catch (detailError) {
              console.warn(`Could not fetch details for pricebook ${pricebook.id}: ${detailError.message}`);
            }
          }
        }
        */

        await pricebookService.updateSyncStatus(true, new Date());

        console.log(
          `✅ Pricebook sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `❌ Pricebook sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("💥 Max retries reached. Pricebook sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

/**
 * Historical pricebook sync (date-based)
 * Used for initial full sync of historical data
 */
const pricebookScheduler = async (daysAgo) => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `🚀 Fetching historical pricebooks for ${daysAgo} days (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );

      const pricebooksByDate = await getPricebooksByDate(daysAgo);

      if (!Array.isArray(pricebooksByDate)) {
        console.log("No historical pricebook data found");
        return { success: true, savedCount: 0, hasNewData: false };
      }

      let totalSavedCount = 0;
      let totalProcessedCount = 0;

      for (const dateResult of pricebooksByDate) {
        if (
          dateResult.data &&
          dateResult.data.data &&
          Array.isArray(dateResult.data.data) &&
          dateResult.data.data.length > 0
        ) {
          console.log(
            `📅 Processing ${dateResult.data.data.length} pricebooks for ${dateResult.date}...`
          );

          const result = await pricebookService.savePricebooks(
            dateResult.data.data
          );

          totalSavedCount += result.stats.newRecords;
          totalProcessedCount += result.stats.success;

          // Optional: Sync pricebook details for active pricebooks
          // Uncomment if client wants detailed product prices per pricebook
          /*
          for (const pricebook of dateResult.data.data) {
            if (pricebook.isActive) {
              try {
                console.log(`Fetching details for pricebook: ${pricebook.name} (ID: ${pricebook.id})`);
                const pricebookDetails = await getPricebookDetails(pricebook.id);
                
                if (pricebookDetails.data && pricebookDetails.data.length > 0) {
                  await pricebookService.savePricebookDetails(pricebook.id, pricebookDetails.data);
                }
              } catch (detailError) {
                console.warn(`Could not fetch details for pricebook ${pricebook.id}: ${detailError.message}`);
              }
            }
          }
          */

          console.log(
            `✅ Date ${dateResult.date}: ${result.stats.success} processed, ${result.stats.newRecords} new`
          );
        } else {
          console.log(`📅 No pricebooks found for ${dateResult.date}`);
        }
      }

      // Mark historical sync as completed
      await pricebookService.updateSyncStatus(true, new Date());

      console.log(
        `🎉 Historical pricebook sync completed: ${totalProcessedCount} total processed, ${totalSavedCount} new pricebooks saved`
      );

      return {
        success: true,
        savedCount: totalSavedCount,
        hasNewData: totalSavedCount > 0,
      };
    } catch (error) {
      retryCount++;
      console.error(
        `❌ Historical pricebook sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error(
          "💥 Max retries reached. Historical pricebook sync failed."
        );
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

module.exports = {
  pricebookScheduler,
  pricebookSchedulerCurrent,
};
