// src/lark/customerLarkService.js
const axios = require("axios");

// Lark Base Configuration for Customer Sync (NEW - separate from existing CRM)
const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

// Customer Sync specific Lark configuration
const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;
const CUSTOMER_SYNC_CHAT_ID = process.env.LARK_CUSTOMER_SYNC_CHAT_ID;

/**
 * Get Lark access token for customer sync (separate from existing CRM token)
 */
async function getCustomerSyncLarkToken() {
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
    console.error("❌ Error getting customer sync Lark token:", error.message);
    throw error;
  }
}

function parsePhoneNumber(phoneString) {
  if (!phoneString) return null;

  // Remove all non-digit characters
  const cleanPhone = phoneString.replace(/\D/g, "");

  // If empty after cleaning, return null
  if (!cleanPhone) return null;

  // Convert to number
  const phoneNumber = parseInt(cleanPhone, 10);

  // Validate it's a reasonable phone number (6-15 digits)
  if (isNaN(phoneNumber) || cleanPhone.length < 6 || cleanPhone.length > 15) {
    console.warn(`Invalid phone number format: ${phoneString}, using null`);
    return null;
  }

  return phoneNumber;
}

/**
 * Map KiotViet customer data to Lark Base fields
 */
function mapCustomerToLarkFields(customer) {
  return {
    // Primary field - use KiotViet customer ID (Text field)
    Id: customer.id?.toString() || "",

    // Customer identification (Text fields)
    "Mã Khách Hàng": customer.code || "",
    "Tên Khách Hàng": customer.name || "",

    // Contact information
    "Số Điện Thoại": parsePhoneNumber(customer.contactNumber), // ← FIX: Number field!
    Email: customer.email || "",

    // Address information (Text fields)
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",

    // Business information (Text fields)
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",

    // Financial information (Text fields - confirmed from Base structure)
    "Nợ Hiện Tại": customer.debt ? customer.debt.toString() : "0",
    "Tổng Bán": customer.totalInvoiced
      ? customer.totalInvoiced.toString()
      : "0",
    "Điểm Hiện Tại": customer.rewardPoint
      ? customer.rewardPoint.toString()
      : "0",

    // Store information (Text field)
    "Id Cửa Hàng": customer.retailerId?.toString() || "",

    // Dates - format for Lark datetime fields (DateTime fields)
    "Ngày Tạo": customer.createdDate
      ? formatDateForLark(customer.createdDate)
      : null,
    "Thời Gian Cập Nhật": customer.modifiedDate
      ? formatDateForLark(customer.modifiedDate)
      : formatDateForLark(new Date()),

    // Gender - map to Lark single select options (Single select field)
    "Giới tính": mapGenderToLarkOption(customer.gender),

    // Notes (Text field)
    "Ghi Chú": customer.comments || "",
  };
}

/**
 * Map gender boolean to Lark single select option
 */
function mapGenderToLarkOption(gender) {
  if (gender === true) return "nam";
  if (gender === false) return "nữ";
  return null; // No selection for undefined
}

/**
 * Format date for Lark datetime field
 */
function formatDateForLark(dateInput) {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;

    // Lark expects timestamp in milliseconds
    return date.getTime();
  } catch (error) {
    console.warn("Date formatting error:", error.message);
    return null;
  }
}

/**
 * Add a single customer record to Lark Base
 */
async function addCustomerToLarkBase(customer) {
  try {
    if (!CUSTOMER_SYNC_BASE_TOKEN || !CUSTOMER_SYNC_TABLE_ID) {
      throw new Error("Missing Lark Base configuration for customer sync");
    }

    const token = await getCustomerSyncLarkToken();
    const mappedFields = mapCustomerToLarkFields(customer);

    console.log(`📝 Adding customer ${customer.code} to Lark Base...`);

    const recordData = {
      fields: mappedFields,
    };

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
      console.error("❌ Lark API Error:", response.data);
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.error(
      `❌ Error adding customer ${customer.code} to Lark:`,
      error.message
    );

    // Check if it's a duplicate record error
    if (error.response?.data?.code === 1254001) {
      console.log(
        `⚠️ Customer ${customer.code} already exists in Lark, updating instead...`
      );
      return await updateCustomerInLarkBase(customer);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Update existing customer record in Lark Base
 */
async function updateCustomerInLarkBase(customer) {
  try {
    // First, find the existing record by customer ID
    const existingRecord = await findCustomerInLarkBase(customer.id);

    if (!existingRecord) {
      console.log(
        `Customer ${customer.code} not found for update, creating new record...`
      );
      return await addCustomerToLarkBase(customer);
    }

    const token = await getCustomerSyncLarkToken();
    const mappedFields = mapCustomerToLarkFields(customer);

    console.log(`🔄 Updating customer ${customer.code} in Lark Base...`);

    const updateData = {
      fields: mappedFields,
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
      console.log(`✅ Customer ${customer.code} updated successfully`);
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
    console.error(
      `❌ Error updating customer ${customer.code} in Lark:`,
      error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Find customer in Lark Base by KiotViet ID
 */
async function findCustomerInLarkBase(customerId) {
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
    console.error(
      `Error finding customer ${customerId} in Lark:`,
      error.message
    );
    return null;
  }
}

/**
 * Sync multiple customers to Lark Base with batch processing
 */
async function syncCustomersToLarkBase(customers) {
  console.log(
    `🚀 Starting Lark sync for ${customers.length} customers with duplicate prevention...`
  );

  let successCount = 0;
  let failCount = 0;
  let updateCount = 0;
  let newCount = 0;
  let skippedCount = 0;
  const BATCH_SIZE = 100;

  try {
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          customers.length / BATCH_SIZE
        )}`
      );

      for (const customer of batch) {
        try {
          // ✅ FIXED: Check for duplicates before processing
          const existsCheck = await checkCustomerExists(customer);

          if (existsCheck.exists) {
            console.log(
              `⚠️ Customer ${customer.code} already exists (${existsCheck.matchType} match), updating...`
            );

            const updateResult = await updateCustomerInLarkBase(
              customer,
              existsCheck.record
            );

            if (updateResult.success) {
              updateCount++;
              successCount++;
            } else {
              console.error(
                `Failed to update ${customer.code}:`,
                updateResult.error
              );
              failCount++;
            }
          } else {
            // Add new customer
            const addResult = await addCustomerToLarkBase(customer);

            if (addResult.success) {
              newCount++;
              successCount++;
              console.log(
                `✅ New customer ${customer.code} added successfully`
              );
            } else {
              console.error(`Failed to add ${customer.code}:`, addResult.error);
              failCount++;
            }
          }
        } catch (error) {
          console.error(
            `Error processing customer ${customer.code}:`,
            error.message
          );
          failCount++;
        }

        // Rate limiting delay
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Batch delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const stats = {
      total: customers.length,
      success: successCount,
      newRecords: newCount,
      updated: updateCount,
      failed: failCount,
      skipped: skippedCount,
    };

    console.log(`🎉 Lark sync completed:`, stats);

    return {
      success: failCount === 0,
      stats: stats,
      message: `Processed ${successCount}/${customers.length} customers successfully`,
    };
  } catch (error) {
    console.error("❌ Error in Lark sync process:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: customers.length,
        success: successCount,
        newRecords: newCount,
        updated: updateCount,
        failed: failCount + 1,
        skipped: skippedCount,
      },
    };
  }
}

/**
 * Send notification about sync completion
 */
async function sendLarkSyncNotification(stats, syncType = "manual") {
  try {
    const token = await getCustomerSyncLarkToken();

    if (!CUSTOMER_SYNC_CHAT_ID) {
      console.log(
        "⚠️ LARK_CUSTOMER_SYNC_CHAT_ID not configured. Skipping notification."
      );
      return;
    }

    const message = {
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: "🔄 Customer Sync to Lark Base Completed",
          },
          template: stats.failed === 0 ? "green" : "orange",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**📊 Sync Statistics:**\n**Total Processed:** ${
                stats.total
              }\n**✅ New Records:** ${stats.newRecords}\n**🔄 Updated:** ${
                stats.updated || 0
              }\n**❌ Failed:** ${stats.failed}`,
            },
          },
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**🕒 Sync Type:** ${syncType}\n**⏰ Completed:** ${new Date().toLocaleString(
                "vi-VN",
                {
                  timeZone: "Asia/Ho_Chi_Minh",
                }
              )}`,
            },
          },
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "📋 Open Customer Base",
                },
                type: "primary",
                url: `https://dieptra2018.sg.larksuite.com/base/${CUSTOMER_SYNC_BASE_TOKEN}?table=${CUSTOMER_SYNC_TABLE_ID}`,
              },
            ],
          },
        ],
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/im/v1/messages`,
      {
        receive_id: CUSTOMER_SYNC_CHAT_ID,
        msg_type: "interactive",
        content: JSON.stringify(message.card),
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    console.log("📢 Lark sync notification sent successfully");
  } catch (error) {
    console.error("⚠️ Failed to send Lark sync notification:", error.message);
  }
}

async function checkCustomerExists(customer) {
  try {
    const token = await getCustomerSyncLarkToken();

    // Search by both ID and customer code for thorough duplicate checking
    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/search`,
      {
        filter: {
          conditions: [
            {
              field_name: "Id",
              operator: "is",
              value: [customer.id.toString()],
            },
            {
              field_name: "Mã Khách Hàng",
              operator: "is",
              value: [customer.code],
            },
          ],
          conjunction: "or", // Match either ID or code
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
      return {
        exists: true,
        record: response.data.data.items[0],
        matchType:
          response.data.data.items[0].fields.Id === customer.id.toString()
            ? "id"
            : "code",
      };
    }

    return { exists: false };
  } catch (error) {
    console.error(
      `Error checking customer ${customer.code} exists:`,
      error.message
    );
    return { exists: false, error: error.message };
  }
}

async function batchUpdateExistingCustomersSmartly(customers) {
  let updateCount = 0;
  let skippedCount = 0;

  console.log(
    `🔍 Checking ${customers.length} existing customers for changes...`
  );

  // Get existing customers with their current data from Lark
  const existingCustomersData = await getExistingCustomersWithData(customers);

  for (const customer of customers) {
    try {
      // Find the existing record in Lark
      const existingRecord = existingCustomersData.find(
        (record) =>
          record.fields.Id === customer.id?.toString() ||
          record.fields["Mã Khách Hàng"] === customer.code
      );

      if (!existingRecord) {
        console.log(
          `⚠️ Customer ${customer.code} not found in existing data, skipping...`
        );
        continue;
      }

      // Check if customer data has changed
      const hasChanged = hasCustomerDataChanged(
        customer,
        existingRecord.fields
      );

      if (hasChanged) {
        console.log(`🔄 Updating customer ${customer.code} (data changed)...`);
        const result = await updateCustomerInLarkBase(customer);
        if (result.success) updateCount++;
      } else {
        console.log(`⏭️ Skipping customer ${customer.code} (no changes)`);
        skippedCount++;
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`Update failed for ${customer.code}:`, error.message);
    }
  }

  console.log(
    `✅ Smart update completed: ${updateCount} updated, ${skippedCount} skipped`
  );
  return updateCount;
}

/**
 * Get existing customers with their current field data
 */
async function getExistingCustomersWithData(customers) {
  const token = await getCustomerSyncLarkToken();
  const customerIds = customers.map((c) => c.id?.toString()).filter(Boolean);
  const customerCodes = customers.map((c) => c.code).filter(Boolean);

  const existingData = [];

  // Batch search for existing customers (much faster than individual lookups)
  const BATCH_SIZE = 100;

  for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
    const idBatch = customerIds.slice(i, i + BATCH_SIZE);

    try {
      const response = await axios.post(
        `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/search`,
        {
          filter: {
            conditions: [
              {
                field_name: "Id",
                operator: "in",
                value: idBatch,
              },
            ],
            conjunction: "and",
          },
          automatic_fields: false, // Get all fields
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      if (response.data.code === 0) {
        existingData.push(...response.data.data.items);
      }
    } catch (error) {
      console.error(`Error fetching batch ${i}:`, error.message);
    }

    // Rate limiting between batches
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return existingData;
}

/**
 * Check if customer data has actually changed
 */
function hasCustomerDataChanged(kiotVietCustomer, larkFields) {
  // Compare key fields that might change
  const fieldsToCheck = [
    { kv: "name", lark: "Tên Khách Hàng" },
    { kv: "contactNumber", lark: "Số Điện Thoại", transform: parsePhoneNumber },
    { kv: "email", lark: "Email" },
    { kv: "address", lark: "Địa Chỉ" },
    {
      kv: "debt",
      lark: "Nợ Hiện Tại",
      transform: (val) => val?.toString() || "0",
    },
    {
      kv: "totalInvoiced",
      lark: "Tổng Bán",
      transform: (val) => val?.toString() || "0",
    },
    {
      kv: "rewardPoint",
      lark: "Điểm Hiện Tại",
      transform: (val) => val?.toString() || "0",
    },
  ];

  for (const field of fieldsToCheck) {
    let kiotVietValue = kiotVietCustomer[field.kv];
    if (field.transform) {
      kiotVietValue = field.transform(kiotVietValue);
    }

    const larkValue = larkFields[field.lark];

    // Convert both to strings for comparison
    const kiotVietStr = (kiotVietValue || "").toString();
    const larkStr = (larkValue || "").toString();

    if (kiotVietStr !== larkStr) {
      console.log(
        `📝 Change detected in ${field.lark}: "${larkStr}" → "${kiotVietStr}"`
      );
      return true;
    }
  }

  return false; // No changes detected
}

/**
 * UPDATED: Main optimized sync with smart updates
 */
async function syncCustomersToLarkBaseOptimized(customers) {
  console.log(
    `🚀 OPTIMIZED SYNC: Starting smart sync for ${customers.length} customers...`
  );

  const startTime = Date.now();

  try {
    // Step 1: Get all existing customer IDs in bulk
    const existingIds = await getAllExistingCustomerIds();

    // Step 2: Separate new vs existing customers
    const newCustomers = [];
    const existingCustomers = [];

    customers.forEach((customer) => {
      const customerId = customer.id?.toString();
      const customerCode = customer.code;

      if (existingIds.has(customerId) || existingIds.has(customerCode)) {
        existingCustomers.push(customer);
      } else {
        newCustomers.push(customer);
      }
    });

    console.log(
      `📊 Analysis: ${newCustomers.length} new, ${existingCustomers.length} existing customers`
    );

    // Step 3: Batch add new customers (fast)
    let newCount = 0;
    if (newCustomers.length > 0) {
      console.log(
        `➕ Adding ${newCustomers.length} new customers in batches...`
      );
      const addResults = await batchAddCustomersToLarkBase(newCustomers);
      newCount = addResults.filter((r) => r.success !== false).length;
    }

    // Step 4: SMART UPDATE - only update changed customers
    let updateCount = 0;
    if (existingCustomers.length > 0) {
      console.log(
        `🔍 Smart-checking ${existingCustomers.length} existing customers...`
      );
      updateCount = await batchUpdateExistingCustomersSmartly(
        existingCustomers
      );
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const stats = {
      total: customers.length,
      newRecords: newCount,
      updated: updateCount,
      skipped: existingCustomers.length - updateCount,
      failed:
        customers.length -
        newCount -
        updateCount -
        (existingCustomers.length - updateCount),
      duration: `${duration}s`,
    };

    console.log(`🎉 SMART SYNC COMPLETED:`, stats);

    return { success: true, stats, optimized: true };
  } catch (error) {
    console.error("❌ Smart sync failed:", error.message);
    return await syncCustomersToLarkBase(customers);
  }
}

async function syncCustomersToLarkBaseOptimized(customers) {
  console.log(
    `🚀 OPTIMIZED SYNC: Starting fast sync for ${customers.length} customers...`
  );

  const startTime = Date.now();

  try {
    // Step 1: Get all existing customer IDs in bulk (1-2 API calls vs 26k calls!)
    const existingIds = await getAllExistingCustomerIds();

    // Step 2: Separate new vs existing customers
    const newCustomers = [];
    const existingCustomers = [];

    customers.forEach((customer) => {
      const customerId = customer.id?.toString();
      const customerCode = customer.code;

      if (existingIds.has(customerId) || existingIds.has(customerCode)) {
        existingCustomers.push(customer);
      } else {
        newCustomers.push(customer);
      }
    });

    console.log(
      `📊 Analysis: ${newCustomers.length} new, ${existingCustomers.length} existing customers`
    );

    // Step 3: Batch add new customers (much faster!)
    let newCount = 0;
    if (newCustomers.length > 0) {
      console.log(
        `➕ Adding ${newCustomers.length} new customers in batches...`
      );
      const addResults = await batchAddCustomersToLarkBase(newCustomers);
      newCount = addResults.filter((r) => r.success !== false).length;
    }

    // Step 4: Batch update existing customers (if needed)
    let updateCount = 0;
    if (existingCustomers.length > 0) {
      console.log(
        `🔄 Updating ${existingCustomers.length} existing customers...`
      );
      // Note: Could implement batch update here too if Lark supports it
      updateCount = await batchUpdateExistingCustomersSmartly(
        existingCustomers
      );
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const stats = {
      total: customers.length,
      newRecords: newCount,
      updated: updateCount,
      failed: customers.length - newCount - updateCount,
      duration: `${duration}s`,
      speedup: `${Math.round(customers.length / duration)}x faster`,
    };

    console.log(`🎉 OPTIMIZED SYNC COMPLETED:`, stats);

    return {
      success: true,
      stats,
      optimized: true,
    };
  } catch (error) {
    console.error("❌ Optimized sync failed:", error.message);
    // Fallback to original method
    return await syncCustomersToLarkBase(customers);
  }
}

async function getAllExistingCustomerIds() {
  const token = await getCustomerSyncLarkToken();
  const existingIds = new Set();
  let hasMore = true;
  let pageToken = undefined;

  console.log("🔍 Fetching existing customer IDs from Lark Base...");

  while (hasMore) {
    try {
      const params = {
        page_size: 500,
        fields: ["Id", "Mã Khách Hàng"], // Only fetch ID fields
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
          params,
          timeout: 15000,
        }
      );

      if (response.data.code === 0) {
        const records = response.data.data.items;

        // Build set of existing IDs
        records.forEach((record) => {
          if (record.fields.Id) {
            existingIds.add(record.fields.Id);
          }
          if (record.fields["Mã Khách Hàng"]) {
            existingIds.add(record.fields["Mã Khách Hàng"]);
          }
        });

        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;

        console.log(
          `📊 Found ${existingIds.size} existing customer IDs so far...`
        );
      } else {
        break;
      }
    } catch (error) {
      console.error("Error fetching existing IDs:", error.message);
      break;
    }
  }

  console.log(`✅ Total existing customers in Lark: ${existingIds.size}`);
  return existingIds;
}

async function processBatchIndividually(customers) {
  const results = [];

  for (const customer of customers) {
    try {
      const result = await addCustomerToLarkBase(customer);
      if (result.success) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Failed to add customer ${customer.code}:`, error.message);
    }
    // Small delay for individual processing
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

async function batchAddCustomersToLarkBase(customers) {
  const BATCH_SIZE = 100; // Lark API supports up to 100 records per batch
  const token = await getCustomerSyncLarkToken();
  const results = [];

  console.log(
    `🚀 BATCH MODE: Adding ${customers.length} customers in batches of ${BATCH_SIZE}...`
  );

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(customers.length / BATCH_SIZE);

    console.log(
      `📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} customers)...`
    );

    try {
      // Prepare batch records
      const batchRecords = batch.map((customer) => ({
        fields: mapCustomerToLarkFields(customer),
      }));

      // Single API call for entire batch
      const response = await axios.post(
        `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/batch_create`,
        {
          records: batchRecords,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000, // Longer timeout for batch operations
        }
      );

      if (response.data.code === 0) {
        const successCount = response.data.data.records.length;
        results.push(...response.data.data.records);
        console.log(
          `✅ Batch ${batchNum}: ${successCount}/${batch.length} customers added successfully`
        );
      } else {
        console.error(`❌ Batch ${batchNum} failed:`, response.data.msg);
        // Fall back to individual processing for this batch
        const individualResults = await processBatchIndividually(batch);
        results.push(...individualResults);
      }
    } catch (error) {
      console.error(`❌ Batch ${batchNum} error:`, error.message);
      // Fall back to individual processing
      const individualResults = await processBatchIndividually(batch);
      results.push(...individualResults);
    }

    // Rate limiting between batches
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

module.exports = {
  addCustomerToLarkBase,
  updateCustomerInLarkBase,
  syncCustomersToLarkBase,
  sendLarkSyncNotification,
  mapCustomerToLarkFields,
  getCustomerSyncLarkToken,
  syncCustomersToLarkBaseOptimized,
  batchAddCustomersToLarkBase,
  getAllExistingCustomerIds,
};
