const { getInvoices, getInvoicesByDate } = require("../src/kiotviet");
const invoiceService = require("../src/db/invoiceService");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
} = require("../saveData/saveData");

const invoiceScheduler = async (daysAgo) => {
  try {
    const invoicesByDate = await getInvoicesByDate(daysAgo);

    // Save all orders to database
    let totalSaved = 0;

    for (const dateData of invoicesByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        // Save to database
        const result = await invoiceService.saveInvoices(dateData.data.data);
        totalSaved += result.stats.success;

        // Also save to JSON file
        if (dateData.data.data.length > 0) {
          await appendJsonDataToFile(
            {
              date: dateData.date,
              data: dateData.data.data,
            },
            "saveJson",
            "invoices.json"
          );
        }

        console.log(
          `Saved ${result.stats.success} invoices from ${dateData.date}`
        );
      }
    }

    // Mark historical data as completed
    await invoiceService.updateSyncStatus(true, new Date());

    console.log(`Historical invoices data saved: ${totalSaved} invoices total`);

    return {
      success: true,
      message: `Saved ${totalSaved} invoices from historical data`,
    };
  } catch (error) {
    console.log("Cannot create invoiceSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const invoiceSchedulerCurrent = async () => {
  try {
    const currentInvoices = await getInvoices();

    if (
      currentInvoices &&
      currentInvoices.data &&
      Array.isArray(currentInvoices.data) &&
      currentInvoices.data.length > 0
    ) {
      const result = await saveBothJsonAndMySQL(
        currentInvoices.data,
        invoiceService.saveInvoices,
        "saveJson",
        "invoices.json"
      );

      // Update last sync time
      await invoiceService.updateSyncStatus(true, new Date());

      console.log(
        `Current invoices data saved: ${result.stats.newRecords} new invoices out of ${result.stats.success} processed. ${result.stats.savedToJson} saved to JSON.`
      );

      return {
        success: true,
        data: currentInvoices.data,
        savedCount: result.stats.newRecords,
        hasNewData: result.stats.newRecords > 0,
      };
    } else {
      console.log("No new invoices data to save");
      return {
        success: true,
        data: [],
        savedCount: 0,
        hasNewData: false,
      };
    }
  } catch (error) {
    console.log("Cannot save current invoices", error);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

module.exports = {
  invoiceScheduler,
  invoiceSchedulerCurrent,
};
