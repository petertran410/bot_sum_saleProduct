// src/api/larkSyncApi.js - API endpoints for managing Lark customer sync
const express = require("express");
const router = express.Router();

// Import sync functions
const {
  runCustomerSyncDual,
  runCustomerSyncLarkOnly,
} = require("../syncKiot/syncKiotWithLark");

const {
  quickDuplicateCheckByCode,
  analyzeDuplicatesByCode,
  deleteDuplicateCustomersByCode,
} = require("../lark/customerLarkService");

const {
  triggerManualCustomerLarkSync,
} = require("../../scheduler/customerLarkScheduler");

router.get("/customers/duplicates/check", async (req, res) => {
  try {
    console.log("🔍 API: Starting duplicate check...");

    const result = await quickDuplicateCheckByCode();

    res.json({
      success: true,
      message:
        result.duplicateGroups > 0
          ? `Found ${result.duplicateGroups} duplicate groups`
          : "No duplicates found",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Duplicate check:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/lark-sync/customers/duplicates/analyze
 * Detailed analysis of duplicate customers
 */
router.get("/customers/duplicates/analyze", async (req, res) => {
  try {
    console.log("🔍 API: Starting detailed duplicate analysis...");

    const result = await analyzeDuplicatesByCode();

    res.json({
      success: true,
      message: `Analysis completed. Found ${result.summary.duplicateGroups} duplicate groups.`,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Duplicate analysis:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/lark-sync/customers/duplicates/cleanup
 * Clean up duplicate customers (with dry run option)
 */
router.post("/customers/duplicates/cleanup", async (req, res) => {
  try {
    const { dryRun = true } = req.body;

    console.log(`🗑️ API: Starting duplicate cleanup (dryRun: ${dryRun})...`);

    const result = await deleteDuplicateCustomersByCode(dryRun);

    res.json({
      success: result.success,
      message: dryRun
        ? `Dry run completed. Would delete ${result.totalDeletions} duplicate records.`
        : `Cleanup completed. Deleted ${result.successCount} duplicate records.`,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Duplicate cleanup:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/lark-sync/customers/current
 * Sync current customers to Lark Base only
 */
router.post("/customers/current", async (req, res) => {
  try {
    console.log("🚀 API: Starting current customer sync to Lark...");

    const result = await runCustomerSyncLarkOnly({
      forceHistoricalSync: false,
    });

    res.json({
      success: result.success,
      message: result.success
        ? "Current customers synced to Lark successfully"
        : "Current customer sync to Lark failed",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Current customer sync:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/lark-sync/customers/dual-sync
 * Sync customers to both MySQL and Lark Base
 */
router.post("/customers/dual-sync", async (req, res) => {
  try {
    const {
      skipMySQL = false,
      skipLark = false,
      forceLarkSync = false,
      daysAgo = 176,
    } = req.body;

    console.log("🚀 API: Starting dual customer sync (MySQL + Lark)...");

    const result = await runCustomerSyncDual({
      skipMySQL,
      skipLark,
      forceLarkSync,
      daysAgo: parseInt(daysAgo),
    });

    res.json({
      success: result.overall.success,
      message: result.overall.success
        ? "Dual customer sync completed successfully"
        : "Dual customer sync completed with issues",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Dual customer sync:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/lark-sync/customers/status
 * Get status and basic info about customer sync
 */
router.get("/customers/status", async (req, res) => {
  try {
    const customerService = require("../db/customerService");
    const mysqlStatus = await customerService.getSyncStatus();

    res.json({
      success: true,
      data: {
        mysql: {
          lastSync: mysqlStatus.lastSync,
          historicalCompleted: mysqlStatus.historicalCompleted,
        },
        lark: {
          available: true,
          appId: process.env.LARK_CUSTOMER_SYNC_APP_ID
            ? "configured"
            : "missing",
          appSecret: process.env.LARK_CUSTOMER_SYNC_APP_SECRET
            ? "configured"
            : "missing",
          baseToken: process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN
            ? "configured"
            : "missing",
          tableId: process.env.LARK_CUSTOMER_SYNC_TABLE_ID
            ? "configured"
            : "missing",
          chatId: process.env.LARK_CUSTOMER_SYNC_CHAT_ID
            ? "configured"
            : "missing",
        },
        api: {
          version: "1.0.0",
          supportedOperations: ["current", "dual-sync", "manual-trigger"],
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ API Error - Status check:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/lark-sync/customers/test-connection
 * Test connection to Lark Base
 */
router.get("/customers/test-connection", async (req, res) => {
  try {
    const { getCustomerSyncLarkToken } = require("../lark/customerLarkService");

    // Test Lark authentication for customer sync
    const token = await getCustomerSyncLarkToken();

    if (token) {
      res.json({
        success: true,
        message: "Customer sync Lark connection successful",
        data: {
          tokenReceived: true,
          baseToken: process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN
            ? "configured"
            : "missing",
          tableId: process.env.LARK_CUSTOMER_SYNC_TABLE_ID
            ? "configured"
            : "missing",
          chatId: process.env.LARK_CUSTOMER_SYNC_CHAT_ID
            ? "configured"
            : "missing",
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to get customer sync Lark token",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ API Error - Connection test:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
