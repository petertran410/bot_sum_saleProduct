// File: src/db/customerLarkService.js - Complete file with CORRECT pattern
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
      console.log(
        `✅ Customer ${customer.code} added successfully: ${record.record_id}`
      );
      return {
        success: true,
        record_id: record.record_id,
        data: record,
      };
    } else {
      console.log("Lark API is error", response.data);
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.log("Cannot add customer to lark", error);

    if (error.response?.data?.code === 1254001) {
      console.log(
        `⚠️ Customer ${customer.code} already exists in Lark, updating instead...`
      );
      return await updateCustomerInLarkBase(customer);
    }

    return { success: false, error: error.message };
  }
};

const findCustomerInLarkBase = async (customerId) => {
  try {
    const token = await getCustomerSyncLarkToken();

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/search`,
      {
        filter: {
          conditions: [
            {
              field_name: "Id",
              operator: "is",
              value: [customerId.toString()],
            },
          ],
          conjunction: "and",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0 && response.data.data.items.length > 0) {
      return response.data.data.items[0];
    }

    return null;
  } catch (error) {
    console.log("Cannot find customer in lark", error);
    throw error;
  }
};

const updateCustomerInLarkBase = async (customer) => {
  try {
    const existingRecord = await findCustomerInLarkBase(customer.id);

    if (!existingRecord) {
      return await addCustomerToLarkBase(customer);
    }

    const token = await getCustomerSyncLarkToken();
    const mapFields = mapCustomerToField(customer);
    const updateData = { fields: mapFields };

    const response = await axios.put(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/${existingRecord.record_id}`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0) {
      console.log("Customer updated successfully");
      return {
        success: true,
        record_id: existingRecord.record_id,
        data: response.data.data.record,
        updated: true,
      };
    } else {
      throw new Error(
        `Failed to update customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.log("Cannot update customer in lark", error);
    throw error;
  }
};

// ✅ CURRENT SYNC - Following existing pattern exactly
const saveSyncCustomerIntoLark = async (daysBack = 2) => {
  console.log(
    `🚀 Starting current customer sync to Lark Base (${daysBack} days back)...`
  );

  let totalProcessed = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    const { getCustomers } = require("../kiotviet");
    const customersData = await getCustomers();

    if (customersData && customersData.data && customersData.data.length > 0) {
      console.log(
        `📦 Processing ${customersData.data.length} current customers...`
      );

      for (const customer of customersData.data) {
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
    }

    // Update sync status - following EXACT pattern
    await updateSyncStatus(false, new Date());

    console.log(
      `✅ Current customer Lark sync completed: ${successCount} success, ${failCount} failed`
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
    console.error("❌ Current customer Lark sync failed:", error.message);
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

// ✅ HISTORICAL SYNC - Following existing pattern exactly
const saveSyncByDateCustomerIntoLark = async () => {
  console.log("🚀 Starting historical customer sync to Lark Base...");

  const daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS || "7");
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  try {
    const { getCustomersByDate } = require("../kiotviet");
    console.log(`📅 Processing ${daysAgo} days of historical customer data...`);

    const customersByDate = await getCustomersByDate(daysAgo);

    for (const dateData of customersByDate) {
      console.log(
        `📅 Processing ${dateData.data.data.length} customers for ${dateData.date}`
      );

      if (dateData.data.data.length === 0) {
        console.log(`⏭️ No customers for ${dateData.date}, skipping...`);
        continue;
      }

      for (const customer of dateData.data.data) {
        try {
          if (!customer.id || !customer.code) {
            console.warn(
              `⚠️ Skipping customer with missing fields for ${dateData.date}`
            );
            totalFailed++;
            continue;
          }

          // Add delay between requests
          await new Promise((resolve) =>
            setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenRequests)
          );

          const larkResult = await addCustomerToLarkBase(customer);

          if (larkResult.success) {
            totalSuccess++;
          } else {
            totalFailed++;
            console.error(
              `❌ Failed to sync customer ${customer.code}:`,
              larkResult.error
            );
          }

          totalProcessed++;
        } catch (error) {
          totalFailed++;
          console.error(
            `❌ Error processing customer ${customer.code}:`,
            error.message
          );
        }
      }

      console.log(`📊 Day ${dateData.date} completed`);
      // Longer delay between days
      await new Promise((resolve) =>
        setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches)
      );
    }

    // Mark historical sync as completed - following EXACT pattern
    await updateSyncStatus(true, new Date());

    console.log(
      `✅ Historical customer Lark sync completed: ${totalSuccess} success, ${totalFailed} failed`
    );
    return {
      success: totalFailed === 0,
      stats: {
        total: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        daysProcessed: daysAgo + 1,
      },
    };
  } catch (error) {
    console.error("❌ Historical customer Lark sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
      },
    };
  }
};

// ✅ SYNC STATUS FUNCTIONS - Following EXACT pattern as other services
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
  updateCustomerInLarkBase,
  findCustomerInLarkBase,
  saveSyncCustomerIntoLark,
  saveSyncByDateCustomerIntoLark,
  getSyncStatus,
  updateSyncStatus,
  mapCustomerToField,
  getCustomerSyncLarkToken,
};
