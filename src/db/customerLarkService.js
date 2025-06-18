// File: src/db/customerLarkService.js - Complete replacement
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
    "Số Điện Thoại": customer.contactNumber || "",
    "Email Khách Hàng": customer.email || "",
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",
    "Nợ Hiện Tại": Number(customer.debt) || 0,
    "Tổng Hoá Đơn": Number(customer.totalInvoiced) || 0,
    "Tổng Doanh Thu": Number(customer.totalRevenue) || 0,
    "Điểm Hiện Tại": Number(customer.rewardPoint) || 0,
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
    "Giới Tính": mapGenderToLarkOption(customer.gender),
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

// 🔍 DUPLICATION CHECK SYSTEM
const checkCustomerExists = async (customer) => {
  try {
    const token = await getCustomerSyncLarkToken();

    // Check by customer ID first (most reliable)
    const searchResponse = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/search`,
      {
        filter: {
          conditions: [
            {
              field_name: "Id",
              operator: "is",
              value: [customer.id.toString()],
            },
          ],
          conjunction: "and",
        },
        automatic_fields: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (
      searchResponse.data.code === 0 &&
      searchResponse.data.data.items.length > 0
    ) {
      const existingRecord = searchResponse.data.data.items[0];
      return {
        exists: true,
        record_id: existingRecord.record_id,
        data: existingRecord,
      };
    }

    return { exists: false };
  } catch (error) {
    console.warn(
      `⚠️ Could not check duplication for customer ${customer.code}:`,
      error.message
    );
    return { exists: false }; // Assume doesn't exist if check fails
  }
};

const updateCustomerInLarkBase = async (customer, existingRecordId) => {
  try {
    const token = await getCustomerSyncLarkToken();
    const mapFields = mapCustomerToField(customer);
    const recordData = { fields: mapFields };

    const response = await axios.put(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/${existingRecordId}`,
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
      return {
        success: true,
        updated: true,
        record_id: existingRecordId,
        data: response.data.data.record,
      };
    } else {
      throw new Error(
        `Failed to update customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.error(
      `❌ Error updating customer ${customer.code}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

const addCustomerToLarkBase = async (customer, checkDuplication = true) => {
  try {
    if (!CUSTOMER_SYNC_BASE_TOKEN || !CUSTOMER_SYNC_TABLE_ID) {
      throw new Error("Missing Lark Base configuration for customer sync");
    }

    // 🔍 DUPLICATION CHECK (if enabled)
    if (checkDuplication) {
      const existsCheck = await checkCustomerExists(customer);
      if (existsCheck.exists) {
        console.log(`🔄 Customer ${customer.code} exists, updating...`);
        return await updateCustomerInLarkBase(customer, existsCheck.record_id);
      }
    }

    // 📝 CREATE NEW RECORD
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
        created: true,
        record_id: record.record_id,
        data: record,
      };
    } else {
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    // Handle existing customer error (fallback duplication check)
    if (error.response?.data?.code === 1254001) {
      console.log(
        `🔄 Customer ${customer.code} already exists (fallback detection)`
      );
      return { success: true, exists: true, created: false };
    }

    console.error(
      `❌ Error processing customer ${customer.code}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

// 🚀 PAGINATION-BASED SYNC SYSTEM (MAIN FUNCTION)
const syncAllCustomersToLarkPaginated = async (
  enableDuplicationCheck = true
) => {
  console.log("🚀 Starting PAGINATION-BASED customer sync to Lark Base...");
  console.log(
    `🔍 Duplication checking: ${
      enableDuplicationCheck ? "ENABLED" : "DISABLED"
    }`
  );

  try {
    // ✅ FIX: Correct function import - it's just "getToken", not "getKiotToken"
    const { getToken, makeApiRequest } = require("../kiotviet");
    const KIOTVIET_BASE_URL = "https://public.kiotapi.com";

    let totalSynced = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let totalFailed = 0;
    let currentPage = 0;
    let currentItem = 0;
    const pageSize = 100; // Maximum allowed
    let totalCustomers = 0;
    let totalPages = 0;

    // 🎯 STEP 1: Get first page to determine total count
    console.log("📊 Getting first page to determine total customer count...");

    // ✅ FIX: Use correct function name
    const kiotToken = await getToken();
    const firstResponse = await makeApiRequest({
      method: "GET",
      url: `${KIOTVIET_BASE_URL}/customers`,
      params: {
        pageSize: pageSize,
        currentItem: 0,
        orderBy: "id",
        orderDirection: "ASC",
        includeTotal: true,
        includeCustomerGroup: true,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${kiotToken}`,
      },
    });

    // Extract total count
    totalCustomers = firstResponse.data.total || 0;
    totalPages = Math.ceil(totalCustomers / pageSize);

    // 🎯 STEP 2: Process first page (already fetched)
    if (firstResponse.data.data && firstResponse.data.data.length > 0) {
      currentPage = 1;
      console.log(
        `📄 Page ${currentPage}/${totalPages}: Processing ${firstResponse.data.data.length} customers`
      );

      const result = await syncCustomersToLark(
        firstResponse.data.data,
        enableDuplicationCheck
      );
      totalSynced += result.stats.success;
      totalUpdated += result.stats.updated || 0;
      totalCreated += result.stats.created || 0;
      totalFailed += result.stats.failed;

      console.log(
        `✅ Page ${currentPage} completed: ${result.stats.success} synced (${
          result.stats.created || 0
        } new, ${result.stats.updated || 0} updated), ${
          result.stats.failed
        } failed`
      );

      currentItem += firstResponse.data.data.length;
    }

    // 🎯 STEP 3: Process remaining pages
    while (currentItem < totalCustomers && currentPage < totalPages) {
      currentPage++;

      console.log(
        `📄 Page ${currentPage}/${totalPages}: Fetching customers ${
          currentItem + 1
        }-${Math.min(currentItem + pageSize, totalCustomers)}`
      );

      try {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/customers`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "id",
            orderDirection: "ASC",
            includeTotal: true,
            includeCustomerGroup: true,
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${kiotToken}`,
          },
        });

        if (response.data.data && response.data.data.length > 0) {
          console.log(
            `📥 Page ${currentPage}: Fetched ${response.data.data.length} customers`
          );

          // Sync this page to Lark Base
          const result = await syncCustomersToLark(
            response.data.data,
            enableDuplicationCheck
          );
          totalSynced += result.stats.success;
          totalUpdated += result.stats.updated || 0;
          totalCreated += result.stats.created || 0;
          totalFailed += result.stats.failed;

          console.log(
            `✅ Page ${currentPage} completed: ${
              result.stats.success
            } synced (${result.stats.created || 0} new, ${
              result.stats.updated || 0
            } updated), ${result.stats.failed} failed`
          );
          console.log(
            `📊 Progress: ${totalSynced}/${totalCustomers} customers synced (${(
              (totalSynced / totalCustomers) *
              100
            ).toFixed(1)}%)`
          );

          currentItem += response.data.data.length;

          // Rate limiting between pages
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          console.log(`⚪ Page ${currentPage}: No data returned, stopping`);
          break;
        }
      } catch (pageError) {
        console.error(`❌ Error on page ${currentPage}:`, pageError.message);
        totalFailed += pageSize;
        currentItem += pageSize;
      }
    }

    // 🎯 STEP 4: Mark as completed (ALWAYS update status)
    await updateSyncStatus(true, new Date());

    return {
      success: totalFailed === 0,
      stats: {
        total: totalSynced + totalFailed,
        success: totalSynced,
        created: totalCreated,
        updated: totalUpdated,
        failed: totalFailed,
        pagesProcessed: currentPage,
        totalPages: totalPages,
      },
    };
  } catch (error) {
    console.error("❌ Pagination sync failed:", error.message);
    console.error("🔍 Full error details:", error);

    // ✅ FIX: ALWAYS update status even if sync fails
    try {
      console.log("📊 Updating sync status due to error...");
      await updateSyncStatus(true, new Date()); // Mark as completed to prevent infinite loop
      console.log("✅ Sync status updated after error");
    } catch (statusError) {
      console.error("❌ Could not update sync status:", statusError.message);
    }

    return {
      success: false,
      error: error.message,
      stats: { total: 0, success: 0, created: 0, updated: 0, failed: 0 },
    };
  }
};

// Enhanced sync function with duplication support
const syncCustomersToLark = async (
  customers,
  enableDuplicationCheck = true
) => {
  console.log(
    `🚀 Starting customer sync to Lark Base: ${customers.length} customers`
  );
  console.log(
    `🔍 Duplication checking: ${
      enableDuplicationCheck ? "ENABLED" : "DISABLED"
    }`
  );

  let totalProcessed = 0;
  let successCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failCount = 0;
  const BATCH_SIZE = 100;

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

          const larkResult = await addCustomerToLarkBase(
            customer,
            enableDuplicationCheck
          );

          if (larkResult.success) {
            successCount++;
            if (larkResult.created) {
              createdCount++;
            } else if (larkResult.updated) {
              updatedCount++;
            }
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

    return {
      success: failCount === 0,
      stats: {
        total: totalProcessed,
        success: successCount,
        created: createdCount,
        updated: updatedCount,
        failed: failCount,
      },
    };
  } catch (error) {
    console.error("❌ Customer Lark sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: totalProcessed,
        success: successCount,
        created: createdCount,
        updated: updatedCount,
        failed: failCount,
      },
    };
  }
};

// 🔍 DUPLICATION CHECK UTILITIES
const getDuplicateCustomersReport = async () => {
  try {
    const token = await getCustomerSyncLarkToken();

    console.log("🔍 Scanning for duplicate customers in Lark Base...");

    // Get all customers from Lark Base
    let allRecords = [];
    let hasMore = true;
    let pageToken = null;

    while (hasMore) {
      const params = {
        page_size: 500,
        automatic_fields: false,
      };

      if (pageToken) {
        params.page_token = pageToken;
      }

      const response = await axios.get(
        `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: params,
        }
      );

      if (response.data.code === 0) {
        allRecords.push(...response.data.data.items);
        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;
      } else {
        break;
      }
    }

    // Find duplicates by customer ID
    const idMap = new Map();
    const duplicates = [];

    allRecords.forEach((record) => {
      const customerId = record.fields.Id;
      if (idMap.has(customerId)) {
        duplicates.push({
          customerId: customerId,
          records: [idMap.get(customerId), record],
        });
      } else {
        idMap.set(customerId, record);
      }
    });

    console.log(`📊 Duplicate scan results:`);
    console.log(`   Total records: ${allRecords.length}`);
    console.log(`   Duplicate customers: ${duplicates.length}`);

    return {
      totalRecords: allRecords.length,
      duplicateCount: duplicates.length,
      duplicates: duplicates,
    };
  } catch (error) {
    console.error("❌ Error checking duplicates:", error.message);
    throw error;
  }
};

// Legacy functions (kept for backward compatibility)
const saveCustomersByDateToLark = async (daysAgo) => {
  console.log(
    "⚠️ DEPRECATED: Using legacy date-based sync, redirecting to pagination-based sync"
  );

  try {
    const result = await syncAllCustomersToLarkPaginated(true);
    return result;
  } catch (error) {
    console.error("❌ Legacy sync failed:", error.message);

    // ✅ FIX: Always update status
    try {
      await updateSyncStatus(true, new Date());
    } catch (statusError) {
      console.error("❌ Could not update sync status:", statusError.message);
    }

    throw error;
  }
};

const saveCustomersByDateToLarkChunked = async (totalDays) => {
  console.log(
    "⚠️ DEPRECATED: Using legacy chunked sync, redirecting to pagination-based sync"
  );

  try {
    const result = await syncAllCustomersToLarkPaginated(true);
    return result;
  } catch (error) {
    console.error("❌ Legacy chunked sync failed:", error.message);

    // ✅ FIX: Always update status
    try {
      await updateSyncStatus(true, new Date());
    } catch (statusError) {
      console.error("❌ Could not update sync status:", statusError.message);
    }

    throw error;
  }
};

// Sync status functions
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
  // 🚀 NEW PAGINATION-BASED FUNCTIONS (PRIMARY)
  syncAllCustomersToLarkPaginated,
  syncCustomersToLark,

  // 🔍 DUPLICATION CHECK FUNCTIONS
  checkCustomerExists,
  updateCustomerInLarkBase,
  getDuplicateCustomersReport,

  // 📝 CORE FUNCTIONS
  addCustomerToLarkBase,
  mapCustomerToField,
  getCustomerSyncLarkToken,

  // 📊 STATUS FUNCTIONS
  getSyncStatus,
  updateSyncStatus,

  // ⚠️ LEGACY FUNCTIONS (DEPRECATED)
  saveCustomersByDateToLark,
  saveCustomersByDateToLarkChunked,
};
