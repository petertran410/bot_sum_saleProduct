// File: src/db/customerLarkService.js - FIXED VERSION
const axios = require("axios");
const { getPool } = require("../db");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;

// ✅ FIX 1: Add process lock to prevent simultaneous syncs
let currentSyncRunning = false;
let currentSyncLock = null;

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

// ✅ FIX 2: Improved duplication check with retry mechanism
const checkCustomerExists = async (customer, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const token = await getCustomerSyncLarkToken();

    // Use search API (more reliable than filter parameters)
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
        timeout: 15000, // Increased timeout
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
      `⚠️ Duplication check failed for customer ${customer.code} (attempt ${
        retryCount + 1
      }/${maxRetries}):`,
      error.message
    );

    // ✅ FIX 3: Retry mechanism instead of assuming false
    if (retryCount < maxRetries - 1) {
      console.log(
        `🔄 Retrying duplication check for customer ${customer.code}...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, (retryCount + 1) * 2000)
      ); // Exponential backoff
      return await checkCustomerExists(customer, retryCount + 1);
    }

    // ✅ FIX 4: If all retries fail, assume customer EXISTS to prevent duplicates
    console.error(
      `❌ All duplication check retries failed for customer ${customer.code}, assuming exists to prevent duplication`
    );
    return { exists: true, error: error.message };
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
        if (existsCheck.error) {
          console.log(
            `⚠️ Customer ${customer.code} duplication check failed, skipping to prevent duplicates`
          );
          return { success: true, exists: true, created: false, skipped: true };
        }
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

// ✅ FIX 5: FIXED CURRENT SYNC FUNCTION with process lock
const syncCustomersToLark = async (
  customers,
  enableDuplicationCheck = true
) => {
  // ✅ PREVENT MULTIPLE SYNC PROCESSES
  if (currentSyncRunning) {
    console.log(
      "⚠️ Customer Lark sync already running, skipping this iteration"
    );
    return {
      success: true,
      skipped: true,
      stats: { total: 0, success: 0, created: 0, updated: 0, failed: 0 },
    };
  }

  currentSyncRunning = true;
  currentSyncLock = new Date();

  console.log(
    `🚀 Starting customer sync to Lark Base: ${customers.length} customers`
  );
  console.log(
    `🔍 Duplication checking: ${
      enableDuplicationCheck ? "✅ ENABLED" : "❌ DISABLED"
    }`
  );

  let totalProcessed = 0;
  let successCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  try {
    // ✅ FIX 6: Process customers in smaller batches to prevent timeout
    const batchSize = 10; // Process 10 customers at a time

    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      console.log(
        `📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          customers.length / batchSize
        )} (${batch.length} customers)`
      );

      for (const customer of batch) {
        try {
          totalProcessed++;

          const result = await addCustomerToLarkBase(
            customer,
            enableDuplicationCheck
          );

          if (result.success) {
            successCount++;
            if (result.created) createdCount++;
            if (result.updated) updatedCount++;
            if (result.skipped) skippedCount++;
          } else {
            failCount++;
          }

          // Log progress every 50 customers
          if (totalProcessed % 50 === 0) {
            console.log(
              `📊 Progress: ${totalProcessed}/${customers.length} (${(
                (totalProcessed / customers.length) *
                100
              ).toFixed(1)}%) - Success: ${successCount}, Failed: ${failCount}`
            );
          }

          // Rate limiting to prevent API overwhelm
          await new Promise((resolve) =>
            setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenRequests)
          );
        } catch (customerError) {
          console.error(
            `❌ Error processing customer ${customer.code || customer.id}:`,
            customerError.message
          );
          failCount++;
        }
      }

      // Longer delay between batches
      if (i + batchSize < customers.length) {
        console.log(
          `⏸️ Batch completed, waiting ${LARK_RATE_LIMIT.delayBetweenBatches}ms before next batch...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches)
        );
      }
    }

    console.log(
      `✅ Customer Lark sync completed! Total: ${totalProcessed}, Success: ${successCount} (Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}), Failed: ${failCount}`
    );

    return {
      success: failCount === 0,
      stats: {
        total: totalProcessed,
        success: successCount,
        created: createdCount,
        updated: updatedCount,
        failed: failCount,
        skipped: skippedCount,
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
        skipped: skippedCount,
      },
    };
  } finally {
    // ✅ ALWAYS RELEASE THE LOCK
    currentSyncRunning = false;
    currentSyncLock = null;
    console.log("🔓 Customer Lark sync lock released");
  }
};

// ✅ FIX 7: Add function to check if sync is currently running
const isCurrentSyncRunning = () => {
  return {
    running: currentSyncRunning,
    startTime: currentSyncLock,
    duration: currentSyncLock ? Date.now() - currentSyncLock.getTime() : 0,
  };
};

// 🚀 PAGINATION-BASED SYNC SYSTEM (MAIN FUNCTION) - Keep unchanged as it works
const syncAllCustomersToLarkPaginated = async (
  enableDuplicationCheck = true
) => {
  // Prevent simultaneous historical syncs too
  if (currentSyncRunning) {
    console.log(
      "⚠️ Customer Lark sync already running, cannot start historical sync"
    );
    return {
      success: false,
      error: "Another sync process is already running",
      stats: { total: 0, success: 0, created: 0, updated: 0, failed: 0 },
    };
  }

  currentSyncRunning = true;
  currentSyncLock = new Date();

  try {
    console.log("🚀 Starting PAGINATION-BASED customer sync to Lark Base...");
    console.log(
      `🔍 Duplication checking: ${
        enableDuplicationCheck ? "✅ ENABLED" : "❌ DISABLED"
      }`
    );

    const pool = getPool();
    const pageSize = 100;
    let currentPage = 1;
    let totalCustomers = 0;
    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let currentItem = 0;

    // 🎯 STEP 1: Get total count for progress tracking
    const [countResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM customers"
    );
    totalCustomers = countResult[0].total;
    const totalPages = Math.ceil(totalCustomers / pageSize);

    console.log(
      `📊 Total customers to sync: ${totalCustomers} (${totalPages} pages)`
    );

    // 🎯 STEP 2: Fetch customers page by page from database
    while (currentItem < totalCustomers) {
      try {
        console.log(
          `📄 Processing page ${currentPage}/${totalPages} (items ${currentItem}-${
            currentItem + pageSize - 1
          })`
        );

        const [customers] = await pool.execute(
          "SELECT * FROM customers ORDER BY id LIMIT ? OFFSET ?",
          [pageSize, currentItem]
        );

        if (customers.length === 0) {
          console.log(`⚪ No more customers found, stopping`);
          break;
        }

        // 🎯 STEP 3: Sync customers to Lark Base
        for (const customer of customers) {
          try {
            const result = await addCustomerToLarkBase(
              customer,
              enableDuplicationCheck
            );

            if (result.success) {
              totalSynced++;
              if (result.created) totalCreated++;
              if (result.updated) totalUpdated++;
            } else {
              totalFailed++;
            }

            // Progress logging every 50 customers
            if (totalSynced % 50 === 0) {
              console.log(
                `📈 Progress: ${totalSynced}/${totalCustomers} synced (${(
                  (totalSynced / totalCustomers) *
                  100
                ).toFixed(1)}%)`
              );
            }

            // Rate limiting between requests
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (customerError) {
            console.error(
              `❌ Error syncing customer ${customer.code}:`,
              customerError.message
            );
            totalFailed++;
          }
        }

        console.log(
          `✅ Page ${currentPage} completed: ${
            customers.length
          } customers processed (${(
            (totalSynced / totalCustomers) *
            100
          ).toFixed(1)}%)`
        );

        currentItem += customers.length;
        currentPage++;

        // Rate limiting between pages
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (pageError) {
        console.error(`❌ Error on page ${currentPage}:`, pageError.message);
        totalFailed += pageSize;
        currentItem += pageSize;
        currentPage++;
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
        pagesProcessed: currentPage - 1,
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
  } finally {
    // ✅ ALWAYS RELEASE THE LOCK
    currentSyncRunning = false;
    currentSyncLock = null;
    console.log("🔓 Historical sync lock released");
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
  syncCustomersToLark, // ← FIXED VERSION

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
  isCurrentSyncRunning, // ← NEW: Check if sync is running

  // ⚠️ LEGACY FUNCTIONS (DEPRECATED)
  saveCustomersByDateToLark,
  saveCustomersByDateToLarkChunked,
};
