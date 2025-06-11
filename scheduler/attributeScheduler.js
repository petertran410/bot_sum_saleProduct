// scheduler/attributeScheduler.js
const { getAttributes } = require("../src/kiotviet");
const attributeService = require("../src/db/attributeService");

const attributeSchedulerCurrent = async () => {
  try {
    console.log("🏷️ Starting current attribute sync...");

    const attributeData = await getAttributes();

    if (
      !attributeData.data ||
      !Array.isArray(attributeData.data) ||
      attributeData.data.length === 0
    ) {
      console.log("No attributes found to sync");
      return {
        success: true,
        message: "No attributes to sync",
        savedCount: 0,
        hasNewData: false,
      };
    }

    console.log(`Processing ${attributeData.data.length} attributes...`);
    const result = await attributeService.saveAttributes(attributeData.data);

    if (result.success) {
      await attributeService.updateSyncStatus(false, new Date());
      console.log(
        `✅ Attribute sync completed: ${result.stats.success} attributes, ${result.stats.totalValuesSaved} values`
      );

      return {
        success: true,
        message: `Synced ${result.stats.success} attributes with ${result.stats.totalValuesSaved} values`,
        savedCount: result.stats.success,
        hasNewData: result.stats.success > 0,
        stats: result.stats,
      };
    } else {
      console.error("❌ Attribute sync failed:", result.error);
      return {
        success: false,
        error: result.error || "Unknown error during attribute sync",
        hasNewData: false,
      };
    }
  } catch (error) {
    console.error("❌ Error in current attribute sync:", error.message);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

const attributeScheduler = async () => {
  try {
    console.log("🏷️ Starting initial attribute sync...");

    const result = await attributeSchedulerCurrent();

    if (result.success) {
      // Mark historical sync as completed
      await attributeService.updateSyncStatus(true, new Date());
      console.log("✅ Initial attribute sync completed");

      return {
        success: true,
        message: `Initial sync completed: ${result.savedCount} attributes`,
        stats: result.stats,
      };
    } else {
      console.error("❌ Initial attribute sync failed:", result.error);
      return result;
    }
  } catch (error) {
    console.error("❌ Error in initial attribute sync:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const checkAttributeSyncStatus = async () => {
  try {
    const syncStatus = await attributeService.getSyncStatus();
    const stats = await attributeService.getAttributeStats();

    return {
      ...syncStatus,
      ...stats,
      needsSync: !syncStatus.historicalCompleted,
    };
  } catch (error) {
    console.error("Error checking attribute sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
      totalAttributes: 0,
      totalValues: 0,
      needsSync: true,
    };
  }
};

const attributeSchedulerForce = async () => {
  try {
    console.log("🏷️ Starting forced attribute sync...");

    const result = await attributeSchedulerCurrent();

    if (result.success) {
      console.log("✅ Forced attribute sync completed");
    } else {
      console.error("❌ Forced attribute sync failed:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ Error in forced attribute sync:", error.message);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

module.exports = {
  attributeScheduler,
  attributeSchedulerCurrent,
  checkAttributeSyncStatus,
  attributeSchedulerForce,
};
