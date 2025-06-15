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

/**
 * Enhanced customer sync that syncs to both MySQL and Lark Base
 * This replaces the original runCustomerSync with dual-target syncing
 */
const runCustomerSyncDual = async (options = {}) => {
  console.log("🚀 Starting Enhanced Customer Sync Process...");

  const {
    skipMySQL = false,
    skipLark = false,
    forceLarkSync = false,
    daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS) || 200, // ✅ FIXED: Use environment variable
  } = options;

  const results = {
    mysql: {},
    lark: {},
    overall: {},
  };

  try {
    // 1. MySQL Database Sync (existing logic)
    if (!skipMySQL) {
      console.log("🗄️ Phase 1: MySQL Database Sync...");

      const customerService = require("../db/customerService");
      const syncStatus = await customerService.getSyncStatus();

      if (!syncStatus.historicalCompleted || forceLarkSync) {
        console.log(`📅 Running historical MySQL sync (${daysAgo} days)...`);
        const mysqlResult = await customerScheduler(daysAgo);
        results.mysql = mysqlResult;
      } else {
        console.log("🔄 Running current MySQL sync...");
        const currentMysqlResult = await customerSchedulerCurrent();
        results.mysql = currentMysqlResult;
      }
    } else {
      console.log("⏭️ Skipping MySQL sync as requested");
      results.mysql = { success: true, skipped: true };
    }

    // 2. Lark Base Sync (improved logic)
    if (!skipLark) {
      console.log("📋 Phase 2: Lark Base Sync...");

      if (forceLarkSync) {
        console.log(
          `🔧 Force sync enabled - running historical Lark sync (${daysAgo} days)...`
        );
        const larkResult = await customerLarkScheduler(daysAgo);
        results.lark = larkResult;
      } else {
        console.log("🔄 Running current customer sync to Lark...");
        const currentLarkResult = await customerLarkSchedulerCurrent();
        results.lark = currentLarkResult;
      }
    } else {
      console.log("⏭️ Skipping Lark sync as requested");
      results.lark = { success: true, skipped: true };
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
      },
    };

    if (results.overall.success) {
      console.log("🎉 Enhanced Customer Sync completed successfully!");
      console.log(
        `📊 Summary: MySQL: ${results.overall.summary.mysqlRecords} records, Lark: ${results.overall.summary.larkRecords} new + ${results.overall.summary.larkUpdated} updated`
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

/**
 * Standalone Lark-only customer sync
 * Use this when you only want to sync to Lark without touching MySQL
 */
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
