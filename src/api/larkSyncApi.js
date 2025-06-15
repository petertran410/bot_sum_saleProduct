// src/api/larkSyncApi.js - API endpoints for managing Lark customer sync
const express = require("express");
const router = express.Router();

// Import sync functions
const {
  runCustomerSyncDual,
  runCustomerSyncLarkOnly,
} = require("../syncKiot/syncKiotWithLark");

const {
  triggerManualCustomerLarkSync,
} = require("../../scheduler/customerLarkScheduler");

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
      daysAgo = 250,
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
