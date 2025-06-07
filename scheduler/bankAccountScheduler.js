const { getBankAccounts } = require("../src/kiotviet");
const bankAccountService = require("../src/db/backAccountService");

const bankAccountSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current bank accounts (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentBankAccounts = await getBankAccounts();

      if (
        currentBankAccounts &&
        currentBankAccounts.data &&
        Array.isArray(currentBankAccounts.data)
      ) {
        if (currentBankAccounts.data.length === 0) {
          console.log("No new bank accounts to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentBankAccounts.data.length} bank accounts...`
        );
        const result = await bankAccountService.saveBankAccounts(
          currentBankAccounts.data
        );

        await bankAccountService.updateSyncStatus(true, new Date());

        console.log(
          `Bank account sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
        `Bank account sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Bank account sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

// Bank accounts don't change very frequently, so we primarily sync current data
const bankAccountScheduler = async () => {
  try {
    console.log("Starting bank account sync...");
    const result = await bankAccountSchedulerCurrent();

    if (result.success) {
      console.log("Bank accounts sync completed successfully");
    } else {
      console.error("Error when syncing bank accounts:", result.error);
    }

    return result;
  } catch (error) {
    console.error("Cannot sync bank accounts:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  bankAccountScheduler,
  bankAccountSchedulerCurrent,
};
