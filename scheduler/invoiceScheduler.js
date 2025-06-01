const { getInvoices, getInvoicesByDate } = require("../src/kiotviet");
const invoiceService = require("../src/db/invoiceService");

const invoiceSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current invoices (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentInvoices = await getInvoices();

      if (
        currentInvoices &&
        currentInvoices.data &&
        Array.isArray(currentInvoices.data)
      ) {
        if (currentInvoices.data.length === 0) {
          console.log("No new invoices to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentInvoices.data.length} invoices...`);
        const result = await invoiceService.saveInvoices(currentInvoices.data);

        await invoiceService.updateSyncStatus(true, new Date());

        console.log(
          `Invoice sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Invoice sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Invoice sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const invoiceScheduler = async (daysAgo) => {
  try {
    const invoicesByDate = await getInvoicesByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of invoicesByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} invoices from ${dateData.date}`
        );
        const result = await invoiceService.saveInvoices(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await invoiceService.updateSyncStatus(true, new Date());
    console.log(`Historical invoices data saved: ${totalSaved} invoices total`);

    return {
      success: true,
      message: `Saved ${totalSaved} invoices from historical data`,
    };
  } catch (error) {
    console.error("Cannot create invoiceSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  invoiceScheduler,
  invoiceSchedulerCurrent,
};
