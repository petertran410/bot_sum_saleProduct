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
        const result = await customerService.saveCustomers(dateData.data.data);
        totalSaved += result.stats.success;

        if (dateData.data.data.length > 0) {
          await appendJsonDataToFile(
            {
              date: dateData.date,
              data: dateData.data.data,
            },
            "saveJson",
            "customers.json"
          );
        }

        console.log(
          `Saved ${result.stats.success} customers from ${dateData.date}`
        );
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
    console.log("Cannot create customerSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const customerSchedulerCurrent = async () => {
  try {
    const currentCustomers = await getCustomers();

    if (
      currentCustomers &&
      currentCustomers.data &&
      Array.isArray(currentCustomers.data) &&
      currentCustomers.data.length > 0
    ) {
      const result = await saveBothJsonAndMySQL(
        currentCustomers.data,
        customerService.saveCustomers,
        "saveJson",
        "customers.json"
      );

      await customerService.updateSyncStatus(true, new Date());

      console.log(
        `Curren customers data saved: ${result.stats.newRecords} new customers out of ${result.stats.success} processed.`
      );

      return {
        success: true,
        data: currentCustomers.data,
        savedCount: result.stats.newRecords,
        hasNewData: result.stats.newRecords > 0,
      };
    } else {
      console.log("No customer data returned from KiotViet API");
      return {
        success: true,
        data: [],
        savedCount: 0,
        hasNewData: false,
      };
    }
  } catch (error) {
    console.error("Error synchronizing customers:", error);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

module.exports = {
  customerScheduler,
  customerSchedulerCurrent,
};
