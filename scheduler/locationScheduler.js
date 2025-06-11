const { getLocations } = require("../src/kiotviet");
const locationService = require("../src/db/locationService");

const locationSchedulerOneTime = async (forceSync = false) => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  try {
    // Check if locations already exist (unless force sync is requested)
    if (!forceSync) {
      const { getPool } = require("../src/db");
      const pool = getPool();
      const [existingLocations] = await pool.execute(
        "SELECT COUNT(*) as count FROM locations"
      );

      if (existingLocations[0].count > 0) {
        console.log(
          `📍 Locations already synced (${existingLocations[0].count} locations found). Skipping sync.`
        );
        return {
          success: true,
          savedCount: 0,
          hasNewData: false,
          message: "Locations already exist. Use forceSync=true to re-sync.",
        };
      }
    }

    while (retryCount < MAX_RETRIES) {
      try {
        console.log(
          `🏢 Fetching locations for one-time sync (attempt ${
            retryCount + 1
          }/${MAX_RETRIES})...`
        );

        const allLocations = await getLocations();

        if (
          allLocations &&
          allLocations.data &&
          Array.isArray(allLocations.data)
        ) {
          if (allLocations.data.length === 0) {
            console.log("⚠️ No locations found in KiotViet");
            return { success: true, savedCount: 0, hasNewData: false };
          }

          console.log(
            `📍 Processing ${allLocations.data.length} locations for one-time sync...`
          );

          // Log sample location structure for debugging
          if (allLocations.data.length > 0) {
            const sample = allLocations.data[0];
            console.log("🔍 Sample location structure:", {
              id: sample.id,
              name: sample.name,
              normalName: sample.normalName,
            });
          }

          const result = await locationService.saveLocations(allLocations.data);

          // Mark as completed - locations don't need regular updates
          await locationService.updateSyncStatus(true, new Date());

          console.log(
            `✅ One-time location sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
          );

          return {
            success: true,
            savedCount: result.stats.newRecords,
            hasNewData: result.stats.newRecords > 0,
            message: `One-time location sync completed successfully`,
          };
        }

        return { success: true, savedCount: 0, hasNewData: false };
      } catch (error) {
        retryCount++;
        console.error(
          `❌ Location sync attempt ${retryCount} failed:`,
          error.message
        );

        if (retryCount < MAX_RETRIES) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          console.error("💥 Max retries reached. Location sync failed.");
          return { success: false, error: error.message, hasNewData: false };
        }
      }
    }
  } catch (error) {
    console.error("❌ Location one-time sync failed:", error);
    return { success: false, error: error.message, hasNewData: false };
  }
};

// Helper function to check if locations are already synced
const checkLocationSyncStatus = async () => {
  try {
    const { getPool } = require("../src/db");
    const pool = getPool();
    const [count] = await pool.execute(
      "SELECT COUNT(*) as count FROM locations"
    );
    const [syncStatus] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = 'locations'"
    );

    return {
      locationCount: count[0].count,
      lastSync: syncStatus.length > 0 ? syncStatus[0].last_sync : null,
      isCompleted:
        syncStatus.length > 0
          ? syncStatus[0].historical_completed === 1
          : false,
      needsSync: count[0].count === 0 || syncStatus.length === 0,
    };
  } catch (error) {
    console.error("Error checking location sync status:", error);
    return { needsSync: true, error: error.message };
  }
};

module.exports = {
  locationSchedulerOneTime,
  checkLocationSyncStatus,
  // Keep legacy name for compatibility
  locationScheduler: locationSchedulerOneTime,
  locationSchedulerCurrent: locationSchedulerOneTime,
};
