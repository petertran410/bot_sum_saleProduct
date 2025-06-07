const { getSuppliers } = require("../src/kiotviet");
const supplierService = require("../src/db/supplierService");

const supplierSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current suppliers (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentSuppliers = await getSuppliers();

      if (
        currentSuppliers &&
        currentSuppliers.data &&
        Array.isArray(currentSuppliers.data)
      ) {
        if (currentSuppliers.data.length === 0) {
          console.log("No new suppliers to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentSuppliers.data.length} suppliers...`);
        const result = await supplierService.saveSuppliers(
          currentSuppliers.data
        );

        await supplierService.updateSyncStatus(true, new Date());

        console.log(
          `Supplier sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Supplier sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Supplier sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Suppliers don't change very frequently, so we primarily sync current data
const supplierScheduler = async () => {
  try {
    console.log("Starting supplier sync...");
    const result = await supplierSchedulerCurrent();

    if (result.success) {
      console.log("Suppliers sync completed successfully");
    } else {
      console.error("Error when syncing suppliers:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync suppliers:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  supplierScheduler,
  supplierSchedulerCurrent,
};
