// src/syncKiot/syncKiotWithLark.js - Enhanced sync controller with Lark integration
const customerService = require("../db/customerService");

// Import existing MySQL schedulers
const {
  customerScheduler,
  customerSchedulerCurrent,
} = require("../../scheduler/customerScheduler");

// Import new Lark schedulers
const {
  customerLarkScheduler,
  customerLarkSchedulerCurrent,
} = require("../../scheduler/customerLarkScheduler");

const runCustomerSyncDual = async (options = {}) => {
  console.log("🚀 Starting Enhanced Customer Sync Process...");

  const {
    skipMySQL = false,
    skipLark = false,
    forceLarkSync = false,
    daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS) || 176,
  } = options;

  console.log(
    `⚙️ Sync Configuration: skipMySQL=${skipMySQL}, skipLark=${skipLark}, forceLarkSync=${forceLarkSync}`
  );

  const results = {
    mysql: {},
    lark: {},
    overall: {},
  };

  try {
    // ✅ CRITICAL: Check sync status for smart sync decisions
    const customerService = require("../db/customerService");
    const syncStatus = await customerService.getSyncStatus();

    console.log(
      `📊 Database Sync Status: historicalCompleted=${syncStatus.historicalCompleted}, lastSync=${syncStatus.lastSync}`
    );

    // 1. MySQL Database Sync
    if (!skipMySQL) {
      console.log("🗄️ Phase 1: MySQL Database Sync...");

      if (!syncStatus.historicalCompleted || forceLarkSync) {
        console.log(
          `📅 Running historical MySQL sync (${daysAgo} days) - RESUMING WHERE LEFT OFF...`
        );
        const mysqlResult = await customerScheduler(daysAgo);
        results.mysql = mysqlResult;
      } else {
        console.log("🔄 Running current MySQL sync (historical completed)...");
        const currentMysqlResult = await customerSchedulerCurrent();
        results.mysql = currentMysqlResult;
      }
    } else {
      console.log("⏭️ SKIPPING MySQL sync (lark-only mode)");
      results.mysql = {
        success: true,
        skipped: true,
        message: "MySQL skipped for lark-only mode",
      };
    }

    // 2. Lark Base Sync - ✅ FIXED: Respect sync_status for resume capability
    if (!skipLark) {
      console.log("📋 Phase 2: Lark Base Sync...");

      // ✅ CRITICAL FIX: Use the same historicalCompleted logic for Lark
      if (!syncStatus.historicalCompleted || forceLarkSync) {
        console.log(
          `📅 Running historical Lark sync (${daysAgo} days) - RESUMING WHERE LEFT OFF...`
        );
        const larkResult = await customerLarkScheduler(daysAgo);
        results.lark = larkResult;

        // ✅ Mark historical sync as completed ONLY if both phases succeed
        if (larkResult.success && results.mysql.success) {
          console.log("🎉 Historical sync completed! Updating sync_status...");
          await customerService.updateSyncStatus(true, new Date());
        }
      } else {
        console.log("🔄 Running current Lark sync (historical completed)...");
        const currentLarkResult = await customerLarkSchedulerCurrent();
        results.lark = currentLarkResult;
      }
    } else {
      console.log("⏭️ SKIPPING Lark sync as requested");
      results.lark = {
        success: true,
        skipped: true,
        message: "Lark sync skipped",
      };
    }

    // 3. Overall Result Assessment
    const mysqlSuccess = results.mysql.success || results.mysql.skipped;
    const larkSuccess = results.lark.success || results.lark.skipped;

    results.overall = {
      success: mysqlSuccess && larkSuccess,
      mysqlStatus: mysqlSuccess ? "success" : "failed",
      larkStatus: larkSuccess ? "success" : "failed",
      completedAt: new Date().toISOString(),
      summary: {
        mysqlRecords: results.mysql.savedCount || 0,
        larkRecords: results.lark.stats?.newRecords || 0,
        larkUpdated: results.lark.stats?.updated || 0,
        skippedMySQL: results.mysql.skipped || false,
        skippedLark: results.lark.skipped || false,
      },
    };

    if (results.overall.success) {
      console.log("🎉 Enhanced Customer Sync completed successfully!");
      console.log(
        `📊 Summary: MySQL: ${results.overall.summary.mysqlRecords} records (skipped: ${results.overall.summary.skippedMySQL}), Lark: ${results.overall.summary.larkRecords} new + ${results.overall.summary.larkUpdated} updated (skipped: ${results.overall.summary.skippedLark})`
      );
    } else {
      console.log("⚠️ Enhanced Customer Sync completed with some issues");
    }

    return results;
  } catch (error) {
    console.error("❌ Enhanced Customer Sync failed:", error.message);
    console.error("Stack trace:", error.stack);

    results.overall = {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString(),
    };

    return results;
  }
};

const runCustomerSyncLarkOnly = async (options = {}) => {
  console.log("🚀 Starting Lark-Only Customer Sync Process...");

  const { daysAgo = 176, forceHistoricalSync = false } = options;

  try {
    let result;

    if (forceHistoricalSync) {
      console.log(`📅 Syncing historical customers (${daysAgo} days)...`);
      result = await customerLarkScheduler(daysAgo);
    } else {
      console.log("🔄 Syncing current customers...");
      result = await customerLarkSchedulerCurrent();
    }

    if (result.success) {
      console.log("✅ Lark-only customer sync completed successfully!");
    } else {
      console.error("❌ Lark-only customer sync failed:", result.error);
    }

    return result;
  } catch (error) {
    console.error("❌ Lark-only customer sync failed:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  runCustomerSyncDual,
  runCustomerSyncLarkOnly,

  // Export individual components for flexibility
  customerLarkScheduler,
  customerLarkSchedulerCurrent,
};
