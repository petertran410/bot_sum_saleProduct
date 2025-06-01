const { getCustomers, getCustomersByDate } = require("../src/kiotviet");
const customerService = require("../src/db/customerService");

const customerSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current customers (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentCustomers = await getCustomers();

      if (
        currentCustomers &&
        currentCustomers.data &&
        Array.isArray(currentCustomers.data)
      ) {
        if (currentCustomers.data.length === 0) {
          console.log("No new customers to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentCustomers.data.length} customers...`);
        const result = await customerService.saveCustomers(
          currentCustomers.data
        );

        await customerService.updateSyncStatus(true, new Date());

        console.log(
          `Customer sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Customer sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Customer sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

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
        console.log(
          `Processing ${dateData.data.data.length} customers from ${dateData.date}`
        );
        const result = await customerService.saveCustomers(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await customerService.updateSyncStatus(true, new Date());
    console.log(
      `Historical customers data saved: ${totalSaved} customers total`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} customers from historical data`,
    };
  } catch (error) {
    console.error("Cannot create customerSchedulerByDate", error);
    return { success: false, error: error.message };
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

        const result = await customerService.saveCustomers(customersForDate);
        totalSaved += result.stats.success;
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
