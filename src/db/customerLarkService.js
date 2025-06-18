// ✅ COMPLETE WORKING SOLUTION - Replace ALL functions in src/db/customerLarkService.js
// Based on your ACTUAL field structure from the JSON

const axios = require("axios");
const { getPool } = require("../db");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;

// ✅ PROCESS LOCK to prevent simultaneous syncs
let currentSyncRunning = false;
let currentSyncLock = null;

// Rate limiting configuration
const LARK_RATE_LIMIT = {
  delayBetweenRequests: 1000,
  delayBetweenBatches: 3000,
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

// ✅ HELPER FUNCTIONS - All properly defined
const smartTextClean = (value, maxLength = 1000) => {
  if (value === null || value === undefined) return "";

  try {
    let cleaned = String(value).trim();

    // ✅ Fix encoding issues that cause TextFieldConvFail
    cleaned = cleaned
      // Remove invisible control characters (major cause of TextFieldConvFail)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
      // Fix smart quotes that can cause issues
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Clean up excessive whitespace
      .replace(/\s+/g, " ")
      .trim();

    // ✅ Smart length handling - preserve important content
    if (cleaned.length > maxLength) {
      // Find a good break point (space, comma, period) near the limit
      let cutPoint = maxLength - 3;
      const breakChars = [" ", ",", ".", "-", ";"];

      for (let i = cutPoint; i > cutPoint - 50 && i > 0; i--) {
        if (breakChars.includes(cleaned[i])) {
          cutPoint = i;
          break;
        }
      }

      cleaned = cleaned.substring(0, cutPoint) + "...";
    }

    return cleaned;
  } catch (error) {
    console.warn(
      `Text cleaning error for: ${String(value).substring(0, 50)}...`,
      error.message
    );
    return String(value || "")
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, "")
      .substring(0, 200);
  }
};

const safeNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;

  try {
    const numValue = Number(value);
    if (isNaN(numValue)) return 0;

    if (Math.abs(numValue) > 999999999999) {
      console.warn(
        `Large number detected: ${numValue}, capping for Lark compatibility`
      );
      return numValue > 0 ? 999999999999 : -999999999999;
    }

    return Math.round(numValue);
  } catch (error) {
    console.warn(`Number conversion error for: ${value}`);
    return 0;
  }
};

// ✅ TEXT VERSION for fields that are actually text (like points)
const safeTextNumber = (value) => {
  if (value === null || value === undefined || value === "") return "0";

  try {
    const numValue = Number(value);
    if (isNaN(numValue)) return "0";

    // Return as string with proper formatting
    return numValue.toString();
  } catch (error) {
    return "0";
  }
};

// ✅ DATE FORMATTING for text fields
const formatDateAsText = (dateInput) => {
  try {
    if (!dateInput) return "";

    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
      return "";
    }

    // Format as Vietnamese date string for text field
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.warn(`Date formatting error for ${dateInput}:`, error.message);
    return "";
  }
};

// ✅ TIMESTAMP for actual date fields (type 5)
const safeDateValue = (dateInput, defaultValue = null) => {
  try {
    if (!dateInput && !defaultValue) return null;

    const date = new Date(dateInput || defaultValue);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.getTime();
  } catch (error) {
    return null;
  }
};

// ✅ GENDER MAPPING with the new "Giới Tính" option
const mapGenderToLarkOption = (gender) => {
  try {
    if (
      gender === true ||
      gender === 1 ||
      String(gender).toLowerCase() === "true" ||
      String(gender).toLowerCase() === "male" ||
      String(gender).toLowerCase() === "nam" ||
      String(gender).toUpperCase() === "M"
    ) {
      return "nam";
    }
    if (
      gender === false ||
      gender === 0 ||
      String(gender).toLowerCase() === "false" ||
      String(gender).toLowerCase() === "female" ||
      String(gender).toLowerCase() === "nữ" ||
      String(gender).toUpperCase() === "F"
    ) {
      return "nữ";
    }
    return null; // Will not select any option
  } catch (error) {
    return null;
  }
};

// ✅ CORRECT FIELD MAPPING based on your actual JSON structure
const mapCustomerToField = (customer) => {
  return {
    // ✅ PRIMARY FIELD (type 2, Number)
    Id: customer.id,

    // ✅ TEXT FIELDS (type 1)
    "Mã Khách Hàng": smartTextClean(customer.code, 100),
    "Tên Khách Hàng": smartTextClean(customer.name, 255),
    "Số Điện Thoại": smartTextClean(customer.contactNumber, 50),
    "Email Khách Hàng": smartTextClean(customer.email, 255),
    "Địa Chỉ": smartTextClean(customer.address, 500),
    "Phường Xã": smartTextClean(customer.wardName, 255),
    "Khu Vực": smartTextClean(customer.locationName, 255),
    "Công Ty": smartTextClean(
      customer.organization || customer.organizationName,
      255
    ),
    "Mã Số Thuế": smartTextClean(customer.taxCode, 50),
    "Cửa Hàng": "2svn",
    "Ghi Chú": smartTextClean(customer.comments, 1000),

    // ✅ TEXT FIELD - Điểm Hiện Tại is type 1, not type 2!
    "Điểm Hiện Tại": safeTextNumber(customer.rewardPoint),

    // ✅ TEXT FIELD - Ngày Sinh is type 1, not type 5!
    "Ngày Sinh": formatDateAsText(customer.birthDate),

    // ✅ SELECT FIELD (type 3)
    "Giới Tính": mapGenderToLarkOption(customer.gender),

    // ✅ NUMBER FIELDS (type 2)
    "Nợ Hiện Tại": safeNumber(customer.debt),
    "Tổng Hoá Đơn": safeNumber(customer.totalInvoiced),
    "Tổng Doanh Thu": safeNumber(customer.totalRevenue),

    // ✅ DATETIME FIELDS (type 5)
    "Thời Gian Tạo": safeDateValue(customer.createdDate),
    "Thời Gian Cập Nhật": safeDateValue(customer.modifiedDate, new Date()),
  };
};

// ✅ DUPLICATION CHECK
const checkCustomerExists = async (customer, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const token = await getCustomerSyncLarkToken();

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
        timeout: 15000,
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

    if (retryCount < maxRetries - 1) {
      console.log(
        `🔄 Retrying duplication check for customer ${customer.code}...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, (retryCount + 1) * 2000)
      );
      return await checkCustomerExists(customer, retryCount + 1);
    }

    console.error(
      `❌ All duplication check retries failed for customer ${customer.code}, assuming exists to prevent duplication`
    );
    return { exists: true, error: error.message };
  }
};

// ✅ UPDATE FUNCTION
const updateCustomerInLarkBase = async (customer, existingRecordId) => {
  try {
    const token = await getCustomerSyncLarkToken();
    const mapFields = mapCustomerToField(customer);

    console.log(
      `📝 Updating customer ${customer.code} with ALL fields (using correct field types)`
    );
    console.log(
      `   Field mapping: Points as text="${mapFields["Điểm Hiện Tại"]}", BirthDate as text="${mapFields["Ngày Sinh"]}"`
    );

    const recordData = { fields: mapFields };

    const response = await axios.put(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/${existingRecordId}`,
      recordData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    if (response.data.code === 0) {
      console.log(
        `✅ Customer ${customer.code} updated successfully with correct field types`
      );
      return {
        success: true,
        updated: true,
        record_id: existingRecordId,
        data: response.data.data.record,
      };
    } else {
      console.error(`❌ Lark API Error for ${customer.code}:`, {
        code: response.data.code,
        msg: response.data.msg,
        sentData: mapFields,
      });
      throw new Error(
        `Update failed: ${response.data.msg} (Code: ${response.data.code})`
      );
    }
  } catch (error) {
    console.error(`❌ Update error for ${customer.code}:`, {
      message: error.message,
      responseData: error.response?.data,
      customerInfo: {
        id: customer.id,
        code: customer.code,
        hasLongFields: {
          name: (customer.name || "").length > 100,
          address: (customer.address || "").length > 200,
          comments: (customer.comments || "").length > 500,
        },
      },
    });
    return { success: false, error: error.message };
  }
};

// ✅ CREATE FUNCTION
const addCustomerToLarkBase = async (customer, checkDuplication = true) => {
  try {
    if (!CUSTOMER_SYNC_BASE_TOKEN || !CUSTOMER_SYNC_TABLE_ID) {
      throw new Error("Missing Lark Base configuration for customer sync");
    }

    if (checkDuplication) {
      const existsCheck = await checkCustomerExists(customer);
      if (existsCheck.exists) {
        if (existsCheck.error) {
          console.log(
            `⚠️ Customer ${customer.code} duplication check failed, skipping to prevent duplicates`
          );
          return { success: true, exists: true, created: false, skipped: true };
        }
        console.log(
          `🔄 Customer ${customer.code} exists, updating with ALL fields...`
        );
        return await updateCustomerInLarkBase(customer, existsCheck.record_id);
      }
    }

    const token = await getCustomerSyncLarkToken();
    const mapFields = mapCustomerToField(customer);

    console.log(
      `📝 Creating customer ${customer.code} with ALL fields using correct types`
    );

    const recordData = { fields: mapFields };

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records`,
      recordData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    if (response.data.code === 0) {
      const record = response.data.data.record;
      console.log(`✅ Customer ${customer.code} created successfully`);
      return {
        success: true,
        created: true,
        record_id: record.record_id,
        data: record,
      };
    } else {
      console.error(`❌ Create error for ${customer.code}:`, response.data);
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
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

// ✅ MAIN SYNC FUNCTION (with process lock)
const syncCustomersToLark = async (
  customers,
  enableDuplicationCheck = true
) => {
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
    const batchSize = 10;

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

          if (totalProcessed % 50 === 0) {
            console.log(
              `📊 Progress: ${totalProcessed}/${customers.length} (${(
                (totalProcessed / customers.length) *
                100
              ).toFixed(1)}%) - Success: ${successCount}, Failed: ${failCount}`
            );
          }

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
    currentSyncRunning = false;
    currentSyncLock = null;
    console.log("🔓 Customer Lark sync lock released");
  }
};

// ✅ PAGINATION SYNC (keep existing implementation)
const syncAllCustomersToLarkPaginated = async (
  enableDuplicationCheck = true
) => {
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

    const pool = getPool();
    const pageSize = 100;
    let currentPage = 1;
    let totalCustomers = 0;
    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let currentItem = 0;

    const [countResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM customers"
    );
    totalCustomers = countResult[0].total;
    const totalPages = Math.ceil(totalCustomers / pageSize);

    console.log(
      `📊 Total customers to sync: ${totalCustomers} (${totalPages} pages)`
    );

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

            if (totalSynced % 50 === 0) {
              console.log(
                `📈 Progress: ${totalSynced}/${totalCustomers} synced (${(
                  (totalSynced / totalCustomers) *
                  100
                ).toFixed(1)}%)`
              );
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (customerError) {
            console.error(
              `❌ Error syncing customer ${customer.code}:`,
              customerError.message
            );
            totalFailed++;
          }
        }

        currentItem += customers.length;
        currentPage++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (pageError) {
        console.error(`❌ Error on page ${currentPage}:`, pageError.message);
        totalFailed += pageSize;
        currentItem += pageSize;
        currentPage++;
      }
    }

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
    try {
      await updateSyncStatus(true, new Date());
    } catch (statusError) {
      console.error("❌ Could not update sync status:", statusError.message);
    }

    return {
      success: false,
      error: error.message,
      stats: { total: 0, success: 0, created: 0, updated: 0, failed: 0 },
    };
  } finally {
    currentSyncRunning = false;
    currentSyncLock = null;
    console.log("🔓 Historical sync lock released");
  }
};

// ✅ OTHER FUNCTIONS (keep existing)
const isCurrentSyncRunning = () => {
  return {
    running: currentSyncRunning,
    startTime: currentSyncLock,
    duration: currentSyncLock ? Date.now() - currentSyncLock.getTime() : 0,
  };
};

const getDuplicateCustomersReport = async () => {
  try {
    const token = await getCustomerSyncLarkToken();
    console.log("🔍 Scanning for duplicate customers in Lark Base...");

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

// ✅ STATUS FUNCTIONS
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();
  try {
    const query = `UPDATE sync_status SET last_sync = ?, historical_completed = ? WHERE entity_type = 'customer_lark'`;
    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES ('customer_lark', ?, ?) ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)`;
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

// Legacy functions for compatibility
const saveCustomersByDateToLark = async (daysAgo) => {
  console.log(
    "⚠️ DEPRECATED: Using legacy date-based sync, redirecting to pagination-based sync"
  );
  try {
    const result = await syncAllCustomersToLarkPaginated(true);
    return result;
  } catch (error) {
    console.error("❌ Legacy sync failed:", error.message);
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
    try {
      await updateSyncStatus(true, new Date());
    } catch (statusError) {
      console.error("❌ Could not update sync status:", statusError.message);
    }
    throw error;
  }
};

module.exports = {
  syncAllCustomersToLarkPaginated,
  syncCustomersToLark,
  checkCustomerExists,
  updateCustomerInLarkBase,
  getDuplicateCustomersReport,
  addCustomerToLarkBase,
  mapCustomerToField,
  getCustomerSyncLarkToken,
  getSyncStatus,
  updateSyncStatus,
  isCurrentSyncRunning,
  saveCustomersByDateToLark,
  saveCustomersByDateToLarkChunked,
};
