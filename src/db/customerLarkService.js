const axios = require("axios");
const { getPool } = require("../db");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const LARK_RATE_LIMIT = {
  maxRequestsPerMinute: 100, // Conservative limit
  maxRequestsPerHour: 5000, // Lark typical limit
  delayBetweenRequests: 800, // 800ms between requests
  delayBetweenBatches: 2000, // 2 seconds between batches
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds retry delay
};

let larkRequestCount = 0;
let larkHourStartTime = Date.now();
let larkMinuteRequestCount = 0;
let larkMinuteStartTime = Date.now();

/**
 * Check Lark API rate limits before making requests
 */
async function checkLarkRateLimit() {
  const currentTime = Date.now();

  // Reset hourly counter
  if (currentTime - larkHourStartTime >= 3600000) {
    larkRequestCount = 0;
    larkHourStartTime = currentTime;
    console.log("🔄 Lark API hourly rate limit counter reset");
  }

  // Reset minute counter
  if (currentTime - larkMinuteStartTime >= 60000) {
    larkMinuteRequestCount = 0;
    larkMinuteStartTime = currentTime;
  }

  // Check hourly limit
  if (larkRequestCount >= LARK_RATE_LIMIT.maxRequestsPerHour) {
    const waitTime = 3600000 - (currentTime - larkHourStartTime);
    console.log(
      `⏳ Lark API hourly rate limit reached. Waiting ${Math.ceil(
        waitTime / 1000
      )} seconds`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    larkRequestCount = 0;
    larkHourStartTime = Date.now();
  }

  // Check minute limit
  if (larkMinuteRequestCount >= LARK_RATE_LIMIT.maxRequestsPerMinute) {
    const waitTime = 60000 - (currentTime - larkMinuteStartTime);
    console.log(
      `⏳ Lark API minute rate limit reached. Waiting ${Math.ceil(
        waitTime / 1000
      )} seconds`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    larkMinuteRequestCount = 0;
    larkMinuteStartTime = Date.now();
  }
}

/**
 * Wrapper for Lark API calls with rate limiting and retries
 */
async function makeLarkApiCall(apiFunction, ...args) {
  for (let attempt = 1; attempt <= LARK_RATE_LIMIT.maxRetries; attempt++) {
    try {
      await checkLarkRateLimit();

      const result = await apiFunction(...args);

      // Increment counters after successful call
      larkRequestCount++;
      larkMinuteRequestCount++;

      // Add delay between requests
      await new Promise((resolve) =>
        setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenRequests)
      );

      return result;
    } catch (error) {
      console.error(
        `❌ Lark API call attempt ${attempt} failed:`,
        error.message
      );

      if (attempt === LARK_RATE_LIMIT.maxRetries) {
        throw error;
      }

      // Wait before retry
      console.log(
        `⏳ Retrying in ${LARK_RATE_LIMIT.retryDelay / 1000} seconds...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, LARK_RATE_LIMIT.retryDelay)
      );
    }
  }
}

const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;
const CUSTOMER_SYNC_CHAT_ID = process.env.LARK_CUSTOMER_SYNC_CHAT_ID;

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
    // Primary field - use KiotViet customer ID (Text field)
    Id: customer.id,

    // Customer identification (Text fields)
    "Mã Khách Hàng": customer.code || "",
    "Tên Khách Hàng": customer.name || "",

    // Contact information
    "Số Điện Thoại": customer.contactNumber,
    "Email Khách Hàng": customer.email || "",

    // Address information (Text fields)
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",

    // Business information (Text fields)
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",

    // Financial information (Text fields - confirmed from Base structure)
    "Nợ Hiện Tại": customer.debt || 0,
    "Tổng Hoá Đơn": customer.totalInvoiced || 0,
    "Tổng Doanh Thu": customer.totalRevenue || 0,
    "Điểm Hiện Tại": customer.rewardPoint || 0,

    // Store information (Text field)
    "Cửa Hàng": "2svn",

    // Dates - format for Lark datetime fields (DateTime fields)
    "Thời Gian Tạo": customer.createdDate
      ? formatDateForLark(customer.createdDate)
      : null,
    "Thời Gian Cập Nhật": customer.modifiedDate
      ? formatDateForLark(customer.modifiedDate)
      : formatDateForLark(new Date()),
    "Ngày Sinh": customer.birthDate
      ? formatDateForLark(customer.birthDate)
      : null,

    // Gender - map to Lark single select options (Single select field)
    "Giới tính": mapGenderToLarkOption(customer.gender),

    // Notes (Text field)
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

    const recordDate = {
      fields: mapFields,
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records`,
      recordDate,
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
      console.log("Lakr API is error", response.data);
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

    console.log(`Updating customer ${customer.code}`);

    const updateData = {
      fields: mapFields,
    };

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

async function saveSyncCustomerIntoLark(daysBack = 2) {
  console.log(
    `🚀 Starting current customer sync to Lark Base (${daysBack} days back)...`
  );

  let totalProcessed = 0;
  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let existingCount = 0;

  try {
    // Import KiotViet functions
    const { getToken, makeApiRequest } = require("../kiotviet");
    const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;

    const token = await getToken();
    const pageSize = 50; // Smaller batches for Lark sync
    let currentItem = 0;
    let hasMoreData = true;

    // Time filter for recent customers
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromDateStr = fromDate.toISOString().split("T")[0];

    console.log(`📅 Fetching customers modified since ${fromDateStr}...`);

    while (hasMoreData) {
      try {
        // Fetch customers from KiotViet
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/customers`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            lastModifiedFrom: fromDateStr,
            orderBy: "modifiedDate",
            orderDirection: "DESC",
            includeTotal: true,
            includeCustomerGroup: true,
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        });

        if (
          response.data &&
          response.data.data &&
          response.data.data.length > 0
        ) {
          const customers = response.data.data;
          console.log(
            `📦 Processing batch of ${customers.length} customers...`
          );

          // Process each customer with rate limiting
          for (const customer of customers) {
            try {
              if (!customer.id || !customer.code) {
                console.warn(
                  `⚠️ Skipping customer with missing required fields`
                );
                failCount++;
                continue;
              }

              // Sync to Lark Base with rate limiting
              const larkResult = await makeLarkApiCall(
                addCustomerToLarkBase,
                customer
              );

              if (larkResult.success) {
                successCount++;
                if (larkResult.updated) {
                  existingCount++;
                  console.log(`🔄 Updated customer ${customer.code} in Lark`);
                } else {
                  newCount++;
                  console.log(`✅ Added new customer ${customer.code} to Lark`);
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

          currentItem += customers.length;
          hasMoreData = customers.length === pageSize;

          // Batch delay
          await new Promise((resolve) =>
            setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches)
          );
        } else {
          hasMoreData = false;
        }
      } catch (error) {
        console.error(`❌ Error fetching customer batch:`, error.message);
        hasMoreData = false;
      }
    }

    // Update sync status
    await updateLarkSyncStatus({
      lastSync: new Date(),
      recordsProcessed: totalProcessed,
      recordsFailed: failCount,
    });

    const result = {
      success: failCount === 0,
      stats: {
        total: totalProcessed,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updated: existingCount,
      },
    };

    console.log(`✅ Current customer Lark sync completed:`, result.stats);
    return result;
  } catch (error) {
    console.error("❌ Current customer Lark sync failed:", error.message);

    await updateLarkSyncStatus({
      lastSync: new Date(),
      syncStatus: "failed",
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
      stats: {
        total: totalProcessed,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updated: existingCount,
      },
    };
  }
}

async function saveSyncByDateCustomerIntoLark() {
  console.log("🚀 Starting historical customer sync to Lark Base...");

  const daysAgo = parseInt(process.env.INITIAL_SCAN_DAYS || "7");
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalNewRecords = 0;
  let totalUpdated = 0;

  try {
    // Import KiotViet functions
    const { getToken, makeApiRequest } = require("../kiotviet");
    const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;

    console.log(`📅 Processing ${daysAgo} days of historical customer data...`);

    // Update sync status to running
    await updateLarkSyncStatus({
      syncStatus: "running",
      lastSync: new Date(),
    });

    // Process day by day (going backwards)
    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      console.log(
        `📅 Processing customers for date: ${formattedDate} (${currentDaysAgo} days ago)`
      );

      const token = await getToken();
      let currentItem = 0;
      let hasMoreData = true;
      const pageSize = 30; // Smaller batches for historical sync
      let dayProcessed = 0;
      let daySuccess = 0;
      let dayFailed = 0;

      while (hasMoreData) {
        try {
          // Fetch customers for this specific date
          const response = await makeApiRequest({
            method: "GET",
            url: `${KIOTVIET_BASE_URL}/customers`,
            params: {
              pageSize: pageSize,
              currentItem: currentItem,
              lastModifiedFrom: formattedDate,
              orderBy: "id",
              orderDirection: "ASC",
              includeTotal: true,
              includeCustomerGroup: true,
            },
            headers: {
              Retailer: process.env.KIOT_SHOP_NAME,
              Authorization: `Bearer ${token}`,
            },
          });

          if (
            response.data &&
            response.data.data &&
            response.data.data.length > 0
          ) {
            const customers = response.data.data;

            // Filter customers modified on this specific date
            const customersForDate = customers.filter((customer) => {
              if (!customer.modifiedDate) return false;
              const customerDate = new Date(customer.modifiedDate)
                .toISOString()
                .split("T")[0];
              return customerDate === formattedDate;
            });

            console.log(
              `📦 Processing ${customersForDate.length} customers for ${formattedDate}...`
            );

            // Process customers with Lark rate limiting
            for (const customer of customersForDate) {
              try {
                if (!customer.id || !customer.code) {
                  console.warn(
                    `⚠️ Skipping customer with missing fields for ${formattedDate}`
                  );
                  dayFailed++;
                  continue;
                }

                // Sync to Lark Base with rate limiting
                const larkResult = await makeLarkApiCall(
                  addCustomerToLarkBase,
                  customer
                );

                if (larkResult.success) {
                  daySuccess++;
                  if (larkResult.updated) {
                    totalUpdated++;
                  } else {
                    totalNewRecords++;
                  }
                } else {
                  dayFailed++;
                  console.error(
                    `❌ Failed to sync customer ${customer.code} for ${formattedDate}:`,
                    larkResult.error
                  );
                }

                dayProcessed++;
              } catch (error) {
                dayFailed++;
                console.error(
                  `❌ Error processing customer ${customer.code} for ${formattedDate}:`,
                  error.message
                );
              }
            }

            currentItem += customers.length;
            hasMoreData = customers.length === pageSize;

            // Delay between pages
            await new Promise((resolve) =>
              setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches)
            );
          } else {
            hasMoreData = false;
          }
        } catch (error) {
          console.error(
            `❌ Error fetching customers for ${formattedDate}:`,
            error.message
          );
          hasMoreData = false;
        }
      }

      totalProcessed += dayProcessed;
      totalSuccess += daySuccess;
      totalFailed += dayFailed;

      console.log(
        `📊 Day ${formattedDate} completed: ${daySuccess} success, ${dayFailed} failed`
      );

      // Longer delay between days to respect rate limits
      await new Promise((resolve) =>
        setTimeout(resolve, LARK_RATE_LIMIT.delayBetweenBatches * 2)
      );
    }

    // Mark historical sync as completed
    await updateLarkSyncStatus({
      historicalCompleted: 1,
      syncStatus: "completed",
      lastSync: new Date(),
      recordsProcessed: totalProcessed,
      recordsFailed: totalFailed,
    });

    const result = {
      success: totalFailed === 0,
      stats: {
        total: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        newRecords: totalNewRecords,
        updated: totalUpdated,
        daysProcessed: daysAgo + 1,
      },
    };

    console.log(`✅ Historical customer Lark sync completed:`, result.stats);
    return result;
  } catch (error) {
    console.error("❌ Historical customer Lark sync failed:", error.message);

    await updateLarkSyncStatus({
      syncStatus: "failed",
      errorMessage: error.message,
      lastSync: new Date(),
    });

    return {
      success: false,
      error: error.message,
      stats: {
        total: totalProcessed,
        success: totalSuccess,
        failed: totalFailed,
        newRecords: totalNewRecords,
        updated: totalUpdated,
      },
    };
  }
}

async function getSyncStatus() {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT historicalCompleted, last_sync_date FROM sync_status WHERE entity_name = 'customer_lark'"
      );

      if (rows.length === 0) {
        // Initialize if doesn't exist
        await connection.execute(
          `INSERT INTO sync_status (entity_name, historicalCompleted, last_sync_date) 
           VALUES ('customer_lark', 0, NULL)`
        );

        return {
          historicalCompleted: false,
          lastSync: null,
        };
      }

      const status = rows[0];
      return {
        historicalCompleted: Boolean(status.historicalCompleted),
        lastSync: status.last_sync_date,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("❌ Error getting customer Lark sync status:", error.message);
    return {
      historicalCompleted: false,
      lastSync: null,
    };
  }
}

async function updateSyncStatus(completed = false) {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.execute(
        `UPDATE sync_status 
         SET historicalCompleted = ?, last_sync_date = NOW()
         WHERE entity_name = 'customer_lark'`,
        [completed ? 1 : 0]
      );

      console.log(
        `✅ Updated customer Lark sync status: historicalCompleted = ${completed}`
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(
      "❌ Error updating customer Lark sync status:",
      error.message
    );
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
  checkLarkRateLimit,
  makeLarkApiCall,
};
