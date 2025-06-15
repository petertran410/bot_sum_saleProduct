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
  console.log("🚀 Starting Enhanced Customer Sync Process (MySQL + Lark)...");

  const {
    skipMySQL = false,
    skipLark = false,
    forceLarkSync = false,
    daysAgo = 250,
  } = options;

  const results = {
    mysql: { success: false },
    lark: { success: false },
    overall: { success: false },
  };

  try {
    // 1. MySQL Sync (existing functionality)
    if (!skipMySQL) {
      console.log("📊 Phase 1: MySQL Database Sync...");

      const mysqlSyncStatus = await customerService.getSyncStatus();
      console.log("MySQL Customer Sync Status:", mysqlSyncStatus);

      if (!mysqlSyncStatus.historicalCompleted) {
        console.log("📅 Running historical customer sync to MySQL...");
        const mysqlResult = await customerScheduler(daysAgo);

        if (mysqlResult.success) {
          console.log("✅ Historical customers data saved to MySQL database");
          results.mysql = mysqlResult;
        } else {
          console.error(
            "❌ Error saving historical customers to MySQL:",
            mysqlResult.error
          );
          results.mysql = { success: false, error: mysqlResult.error };
        }
      } else {
        console.log("🔄 Running current customer sync to MySQL...");
        const currentMySQLResult = await customerSchedulerCurrent();

        if (currentMySQLResult.success) {
          console.log("✅ Current customers data synced to MySQL");
          results.mysql = currentMySQLResult;
        } else {
          console.error(
            "❌ Error syncing current customers to MySQL:",
            currentMySQLResult.error
          );
          results.mysql = { success: false, error: currentMySQLResult.error };
        }
      }
    } else {
      console.log("⏭️ Skipping MySQL sync as requested");
      results.mysql = { success: true, skipped: true };
    }

    // 2. Lark Base Sync (new functionality)
    if (!skipLark) {
      console.log("📋 Phase 2: Lark Base Sync...");

      if (forceLarkSync) {
        console.log("🔧 Force sync enabled - running historical Lark sync...");
        const larkResult = await customerLarkScheduler(daysAgo);

        if (larkResult.success) {
          console.log("✅ Historical customers data synced to Lark Base");
          results.lark = larkResult;
        } else {
          console.error(
            "❌ Error syncing historical customers to Lark:",
            larkResult.error
          );
          results.lark = { success: false, error: larkResult.error };
        }
      } else {
        console.log("🔄 Running current customer sync to Lark...");
        const currentLarkResult = await customerLarkSchedulerCurrent();

        if (currentLarkResult.success) {
          console.log("✅ Current customers data synced to Lark Base");
          results.lark = currentLarkResult;
        } else {
          console.error(
            "❌ Error syncing current customers to Lark:",
            currentLarkResult.error
          );
          results.lark = { success: false, error: currentLarkResult.error };
        }
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
    };

    if (results.overall.success) {
      console.log("🎉 Enhanced Customer Sync completed successfully!");
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

  const {
    daysAgo = 1,
    forceHistoricalSync = false,
    specificDate = null,
  } = options;

  try {
    let result;

    if (specificDate) {
      console.log(`📅 Syncing customers for specific date: ${specificDate}`);
      const {
        customerLarkSchedulerSpecificDate,
      } = require("../../scheduler/customerLarkScheduler");
      result = await customerLarkSchedulerSpecificDate(specificDate);
    } else if (forceHistoricalSync) {
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

/**
 * Migration function to sync existing MySQL customers to Lark
 * Use this to backfill Lark Base with existing customer data
 */
const migrateExistingCustomersToLark = async (batchSize = 100) => {
  console.log("🔄 Starting migration of existing customers to Lark...");

  try {
    const { getPool } = require("../db");
    const { syncCustomersToLarkBase } = require("../lark/customerLarkService");

    const pool = getPool();
    let offset = 0;
    let totalMigrated = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      // Fetch customers from MySQL in batches
      const [rows] = await pool.execute(
        `SELECT * FROM customers ORDER BY id LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      if (rows.length === 0) {
        hasMoreData = false;
        break;
      }

      console.log(
        `📦 Processing batch: ${rows.length} customers (offset: ${offset})`
      );

      // Convert MySQL data back to KiotViet format for Lark sync
      const customersForLark = rows.map((row) => {
        const jsonData = row.jsonData ? JSON.parse(row.jsonData) : {};
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          contactNumber: row.contactNumber,
          email: row.email,
          address: row.address,
          gender: row.gender,
          birthDate: row.birthDate,
          locationName: row.locationName,
          wardName: row.wardName,
          organization: row.organizationName,
          taxCode: row.taxCode,
          comments: row.comments,
          debt: row.debt,
          rewardPoint: row.rewardPoint,
          retailerId: row.retailerId,
          createdDate: row.createdDate,
          modifiedDate: row.modifiedDate,
          ...jsonData, // Include any additional fields from JSON
        };
      });

      // Sync batch to Lark
      const larkResult = await syncCustomersToLarkBase(customersForLark);
      totalMigrated += larkResult.stats.newRecords;

      console.log(
        `✅ Batch completed: ${larkResult.stats.newRecords} migrated, ${larkResult.stats.failed} failed`
      );

      offset += batchSize;

      // Delay between batches to respect API limits
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    console.log(
      `🎉 Migration completed: ${totalMigrated} customers migrated to Lark`
    );

    return {
      success: true,
      totalMigrated,
      message: `Successfully migrated ${totalMigrated} customers to Lark Base`,
    };
  } catch (error) {
    console.error("❌ Customer migration to Lark failed:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  runCustomerSyncDual,
  runCustomerSyncLarkOnly,
  migrateExistingCustomersToLark,

  // Export individual components for flexibility
  customerLarkScheduler,
  customerLarkSchedulerCurrent,
};
