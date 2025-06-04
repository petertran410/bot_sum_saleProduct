const { getUsers, getUsersByDate } = require("../src/kiotviet");
const userService = require("../src/db/userService");

const userSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current users (attempt ${retryCount + 1}/${MAX_RETRIES})...`
      );
      const currentUsers = await getUsers();

      if (
        currentUsers &&
        currentUsers.data &&
        Array.isArray(currentUsers.data)
      ) {
        if (currentUsers.data.length === 0) {
          console.log("No new users to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentUsers.data.length} users...`);
        const result = await userService.saveUsers(currentUsers.data);

        await userService.updateSyncStatus(true, new Date());

        console.log(
          `User sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
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
      console.error(`User sync attempt ${retryCount} failed:`, error.message);

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. User sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const userScheduler = async (daysAgo) => {
  try {
    const usersByDate = await getUsersByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of usersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} users from ${dateData.date}`
        );
        const result = await userService.saveUsers(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await userService.updateSyncStatus(true, new Date());
    console.log(`Historical users data saved: ${totalSaved} users total`);

    return {
      success: true,
      message: `Saved ${totalSaved} users from historical data`,
    };
  } catch (error) {
    console.error("Cannot create userSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  userScheduler,
  userSchedulerCurrent,
};
