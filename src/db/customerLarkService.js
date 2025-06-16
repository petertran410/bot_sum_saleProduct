// File: src/db/customerLarkService.js - Fixed version for Option 1
const axios = require("axios");
const { getPool } = require("../db");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;

// Rate limiting configuration
const LARK_RATE_LIMIT = {
  delayBetweenRequests: 1000, // 1 second between requests
  delayBetweenBatches: 3000, // 3 seconds between batches
  maxRetries: 3,
  retryDelay: 5000,
};

const getCustomerSyncLarkToken = async () => {
  try {
    const response = await axios.post(
      LARK_TOKEN_URL,
      {
        app_id: CUSTOMER_SYNC_APP_ID,
        app_secret: CUSTOMER_SYNC_APP_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
    return response.data.tenant_access_token;
  } catch (error) {
    console.log("Cannot get lark token", error);
    throw error;
  }
};

const mapCustomerToField = (customer) => {
  return {
    Id: customer.id,
    "Mã Khách Hàng": customer.code || "",
    "Tên Khách Hàng": customer.name || "",
    "Số Điện Thoại": customer.contactNumber,
    "Email Khách Hàng": customer.email || "",
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",
    "Nợ Hiện Tại": customer.debt || 0,
    "Tổng Hoá Đơn": customer.totalInvoiced || 0,
    "Tổng Doanh Thu": customer.totalRevenue || 0,
    "Điểm Hiện Tại": customer.rewardPoint || 0,
    "Cửa Hàng": "2svn",
    "Thời Gian Tạo": customer.createdDate
      ? formatDateForLark(customer.createdDate)
      : null,
    "Thời Gian Cập Nhật": customer.modifiedDate
      ? formatDateForLark(customer.modifiedDate)
      : formatDateForLark(new Date()),
    "Ngày Sinh": customer.birthDate
      ? formatDateForLark(customer.birthDate)
      : null,
    "Giới tính": mapGenderToLarkOption(customer.gender),
    "Ghi Chú": customer.comments || "",
  };
};

const mapGenderToLarkOption = (gender) => {
  if (gender === true) return "nam";
  if (gender === false) return "nữ";
  return null;
};

const formatDateForLark = (dateInput) => {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  } catch (error) {
    console.log("Date formatting error:", error.message);
    throw error;
  }
};

const addCustomerToLarkBase = async (customer) => {
  try {
    if (!CUSTOMER_SYNC_BASE_TOKEN || !CUSTOMER_SYNC_TABLE_ID) {
      throw new Error("Missing Lark Base configuration for customer sync");
    }

    const token = await getCustomerSyncLarkToken();
    const mapFields = mapCustomerToField(customer);
    const recordData = { fields: mapFields };

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records`,
      recordData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0) {
      const record = response.data.data.record;
      return {
        success: true,
        record_id: record.record_id,
        data: record,
      };
    } else {
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    if (error.response?.data?.code === 1254001) {
      // Customer already exists - this is okay for current sync
      return { success: true, exists: true };
    }
    return { success: false, error: error.message };
  }
};

// Current sync - receives customers array and syncs to Lark
const syncCustomersToLark = async (customers) => {
  console.log(
    `🚀 Starting customer sync to Lark Base: ${customers.length} customers`
  );

  let totalProcessed = 0;
  let successCount = 0;
  let failCount = 0;
  const BATCH_SIZE = 10; // Small batches for Lark API

  try {
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing Lark batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          customers.length / BATCH_SIZE
        )}`
      );

      for (const customer of batch) {
        try {
          if (!customer.id || !customer.code) {
            console.warn(`⚠️ Skipping customer with missing required fields`);
            failCount++;
            continue;
          }

          // Add delay between requests
          await new Promise((resolve) =>
            setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenRequests)
          );

          const larkResult = await addCustomerToLarkBase(customer);

          if (larkResult.success) {
            successCount++;
          } else {
            failCount++;
            console.error(
              `❌ Failed to sync customer ${customer.code}:`,
              larkResult.error
            );
          }

          totalProcessed++;
        } catch (error) {
          failCount++;
          console.error(
            `❌ Error processing customer ${customer.code}:`,
            error.message
          );
        }
      }

      // Delay between batches
      await new Promise((resolve) =>
        setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches)
      );
    }

    console.log(
      `✅ Customer Lark current sync completed: ${successCount} success, ${failCount} failed`
    );
    return {
      success: failCount === 0,
      stats: {
        total: totalProcessed,
        success: successCount,
        failed: failCount,
      },
    };
  } catch (error) {
    console.error("❌ Customer Lark current sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: totalProcessed,
        success: successCount,
        failed: failCount,
      },
    };
  }
};

// Historical sync - following exact pattern from customerScheduler.js
const saveCustomersByDateToLark = async (daysAgo) => {
  console.log("🚀 Starting historical customer sync to Lark Base...");
  console.log(
    "⚠️ During this process, all current syncs will be paused to avoid API rate limit conflicts"
  );

  try {
    const { getCustomersByDate } = require("../kiotviet");
    const customersByDate = await getCustomersByDate(daysAgo);

    let totalSaved = 0;
    let dayCount = 0;

    for (const dateData of customersByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        const customersForDate = dateData.data.data;
        dayCount++;

        console.log(
          `📅 Day ${dayCount}/${customersByDate.length}: Processing ${customersForDate.length} customers from ${dateData.date}`
        );

        // Sync to Lark in smaller batches to avoid overwhelming the API
        const result = await syncCustomersToLark(customersForDate);
        totalSaved += result.stats.success;

        console.log(
          `📊 Day ${dayCount} completed: ${result.stats.success} synced, ${result.stats.failed} failed`
        );

        // Longer delay between dates to be gentle on APIs
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Mark historical sync as completed
    await updateSyncStatus(true, new Date());

    console.log(
      `✅ Historical customer Lark sync completed: ${totalSaved} customers total from ${dayCount} days`
    );
    console.log("▶️ Current syncs will now resume automatically");

    return {
      success: true,
      stats: {
        total: totalSaved,
        success: totalSaved,
        failed: 0,
        daysProcessed: dayCount,
      },
    };
  } catch (error) {
    console.error("❌ Historical customer Lark sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: 0,
        success: 0,
        failed: 0,
      },
    };
  }
};

// Sync status functions - following exact pattern
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'customer_lark'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('customer_lark', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating customer Lark sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["customer_lark"]
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: rows[0].historical_completed === 1,
      };
    }

    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } catch (error) {
    console.error("Error getting customer Lark sync status:", error);
    throw error;
  }
}

module.exports = {
  addCustomerToLarkBase,
  syncCustomersToLark,
  saveCustomersByDateToLark,
  getSyncStatus,
  updateSyncStatus,
  mapCustomerToField,
  getCustomerSyncLarkToken,
};
