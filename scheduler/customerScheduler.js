const { getCustomers, getCustomersByDate } = require("../src/kiotviet");
const customerService = require("../src/db/customerService");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
} = require("../saveData/saveData");

const customerScheduler = async (daysAgo) => {
  try {
    const customersByDate = await getCustomersByDate(daysAgo);

    let totalSaved = 0;

    for (const dateData of customersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const customersForDate = dateData.data.data;

        // Process in manageable batches
        const BATCH_SIZE = 500;
        for (let i = 0; i < customersForDate.length; i += BATCH_SIZE) {
          const batch = customersForDate.slice(i, i + BATCH_SIZE);

          // Save to both database and JSON file
          const result = await saveBothJsonAndMySQL(
            batch,
            customerService.saveCustomers,
            "saveJson",
            "customers.json"
          );

          totalSaved += result.stats.success;
        }
      }
    }

    await customerService.updateSyncStatus(true, new Date());

    return {
      success: true,
      message: `Saved ${totalSaved} customers from historical data`,
    };
  } catch (error) {
    console.error("Cannot create customerSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

const customerSchedulerCurrent = async () => {
  try {
    const currentCustomers = await getCustomers();

    if (
      currentCustomers &&
      currentCustomers.data &&
      Array.isArray(currentCustomers.data)
    ) {
      if (currentCustomers.data.length === 0) {
        console.log("No customer data to process");
        return { success: true, savedCount: 0, hasNewData: false };
      }

      const BATCH_SIZE = 500;
      let totalSaved = 0;
      let totalNew = 0;

      for (let i = 0; i < currentCustomers.data.length; i += BATCH_SIZE) {
        const batch = currentCustomers.data.slice(i, i + BATCH_SIZE);

        // This saves to BOTH database AND JSON file
        const result = await saveBothJsonAndMySQL(
          batch,
          customerService.saveCustomers,
          "saveJson",
          "customers.json"
        );

        totalSaved += result.stats.success;
        totalNew += result.stats.newRecords;
      }

      await customerService.updateSyncStatus(true, new Date());

      return {
        success: true,
        data: currentCustomers.data,
        savedCount: totalNew,
        hasNewData: totalNew > 0,
      };
    } else {
      console.log("Invalid customer data returned from API");
      return { success: true, savedCount: 0, hasNewData: false };
    }
  } catch (error) {
    console.error("Error synchronizing customers:", error);
    return { success: false, error: error.message, hasNewData: false };
  }
};

const customerSchedulerSpecificDate = async (specificDate) => {
  try {
    console.log(`Starting customer sync for specific date: ${specificDate}`);
    const customersByDate = await getCustomersByDate(0, specificDate);

    let totalSaved = 0;

    for (const dateData of customersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const customersForDate = dateData.data.data;
        console.log(
          `Processing ${customersForDate.length} customers for ${dateData.date}`
        );

        // Use smaller batches for large datasets
        const BATCH_SIZE = 100;
        for (let i = 0; i < customersForDate.length; i += BATCH_SIZE) {
          const batch = customersForDate.slice(i, i + BATCH_SIZE);

          try {
            // Direct database save for reliability
            const result = await customerService.saveCustomers(batch);
            totalSaved += result.stats.success;

            // Optional: Also save to JSON
            await appendJsonDataToFile(
              { date: dateData.date, data: batch },
              "saveJson",
              "customers.json"
            );

            console.log(
              `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete: ${
                result.stats.success
              } saved`
            );
          } catch (batchError) {
            console.error(
              `Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
              batchError
            );
            // Continue with next batch despite errors
          }

          // Allow database to process
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    console.log(
      `Completed sync for ${specificDate}: ${totalSaved} customers saved`
    );
    return {
      success: true,
      message: `Saved ${totalSaved} customers from ${specificDate}`,
    };
  } catch (error) {
    console.error(`Error syncing date ${specificDate}:`, error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  customerScheduler,
  customerSchedulerCurrent,
  customerSchedulerSpecificDate,
};
