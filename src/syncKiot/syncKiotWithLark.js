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

// File: src/syncKiot/syncKiotWithLark.js
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
    // ✅ FIX: Only check MySQL sync status if MySQL sync is not skipped
    let syncStatus = { historicalCompleted: false, lastSync: null };

    if (!skipMySQL) {
      console.log("📊 Checking MySQL sync status...");
      const customerService = require("../db/customerService");
      syncStatus = await customerService.getSyncStatus();
      console.log(
        `📊 MySQL Sync Status: historicalCompleted=${syncStatus.historicalCompleted}, lastSync=${syncStatus.lastSync}`
      );
    } else {
      console.log("⏭️ Skipping MySQL sync status check (lark-only mode)");
      // ✅ FIX: For lark-only mode, create independent sync status
      if (forceLarkSync) {
        syncStatus.historicalCompleted = false; // Force historical sync
      } else {
        // ✅ Check if we should run historical or current sync for Lark
        // Since we're in lark-only mode, we need a different way to track this
        // For now, default to current sync unless forced
        syncStatus.historicalCompleted = true;
      }
    }

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

    // 2. Lark Base Sync
    if (!skipLark) {
      console.log("📋 Phase 2: Lark Base Sync...");

      // ✅ FIX: For lark-only mode, use independent logic
      if (skipMySQL) {
        // Lark-only mode: independent sync logic
        if (forceLarkSync) {
          console.log(
            `📅 Running FORCED historical Lark sync (${daysAgo} days)...`
          );
          const larkResult = await customerLarkScheduler(daysAgo);
          results.lark = larkResult;
        } else {
          console.log("🔄 Running current Lark sync (lark-only mode)...");
          const currentLarkResult = await customerLarkSchedulerCurrent();
          results.lark = currentLarkResult;
        }
      } else {
        // Dual mode: use MySQL sync status
        if (!syncStatus.historicalCompleted || forceLarkSync) {
          console.log(
            `📅 Running historical Lark sync (${daysAgo} days) - RESUMING WHERE LEFT OFF...`
          );
          const larkResult = await customerLarkScheduler(daysAgo);
          results.lark = larkResult;

          // Mark historical sync as completed ONLY if both phases succeed
          if (larkResult.success && results.mysql.success) {
            console.log(
              "🎉 Historical sync completed! Updating sync_status..."
            );
            const customerService = require("../db/customerService");
            await customerService.updateSyncStatus(true, new Date());
          }
        } else {
          console.log("🔄 Running current Lark sync (historical completed)...");
          const currentLarkResult = await customerLarkSchedulerCurrent();
          results.lark = currentLarkResult;
        }
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

const runCustomerSyncLarkOnlyPure = async (options = {}) => {
  console.log("🚀 Starting PURE Lark-Only Customer Sync Process...");

  const {
    daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS) || 176,
    forceHistoricalSync = false,
  } = options;

  console.log(
    `⚙️ Pure Lark Configuration: daysAgo=${daysAgo}, forceHistoricalSync=${forceHistoricalSync}`
  );

  try {
    let result;

    if (forceHistoricalSync) {
      console.log(`📅 Running PURE Lark historical sync (${daysAgo} days)...`);
      result = await customerLarkScheduler(daysAgo);
    } else {
      console.log("🔄 Running PURE Lark current sync...");
      result = await customerLarkSchedulerCurrent();
    }

    if (result.success) {
      console.log("✅ Pure Lark-only customer sync completed successfully!");
      console.log(
        `📊 Lark Stats: ${result.stats?.newRecords || 0} new, ${
          result.stats?.updated || 0
        } updated`
      );
    } else {
      console.error("❌ Pure Lark-only customer sync failed:", result.error);
    }

    return {
      success: result.success,
      lark: result,
      overall: {
        success: result.success,
        larkStatus: result.success ? "success" : "failed",
        mysqlStatus: "skipped",
        completedAt: new Date().toISOString(),
        mode: "pure-lark-only",
      },
    };
  } catch (error) {
    console.error("❌ Pure Lark-only customer sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      overall: {
        success: false,
        error: error.message,
        mode: "pure-lark-only",
      },
    };
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
  runCustomerSyncLarkOnlyPure,
  customerLarkScheduler,
  customerLarkSchedulerCurrent,
};
