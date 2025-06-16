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

  console.log(`🔍 Safe processing ${customers.length} existing customers...`);

  // Simple time-based filtering to avoid unnecessary updates
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const customer of customers) {
    try {
      // Only update if customer was recently modified
      const customerModified = new Date(
        customer.modifiedDate || customer.createdDate
      );
      const needsUpdate = customerModified > sevenDaysAgo;

      if (needsUpdate) {
        console.log(
          `🔄 Updating customer ${customer.code} (recently modified)...`
        );
        const result = await updateCustomerInLarkBase(customer);
        if (result.success) updateCount++;
      } else {
        skippedCount++;
        // Only log every 100th skip to avoid spam
        if (skippedCount % 100 === 0) {
          console.log(
            `⏭️ Skipped ${skippedCount} customers (not recently modified)`
          );
        }
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Update failed for ${customer.code}:`, error.message);
    }
  }

  console.log(
    `✅ Safe update completed: ${updateCount} updated, ${skippedCount} skipped (older than 7 days)`
  );
  return updateCount;
}

async function checkSpecificCustomersExist(customerIds) {
  const token = await getCustomerSyncLarkToken();
  const existingIds = new Set();

  console.log(
    `🎯 Checking existence of ${customerIds.length} specific customers individually...`
  );

  // ✅ SOLUTION: Check customers ONE BY ONE (guaranteed to work)
  for (let i = 0; i < customerIds.length; i++) {
    const customerId = customerIds[i];

    try {
      // Check this specific customer ID
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
          fields: ["Id", "Mã Khách Hàng"],
          page_size: 1, // ✅ CRITICAL: Only return 1 result max
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
        const record = response.data.data.items[0];
        if (record.fields.Id) existingIds.add(record.fields.Id);
        if (record.fields["Mã Khách Hàng"])
          existingIds.add(record.fields["Mã Khách Hàng"]);
      }

      // Progress logging every 100 checks
      if ((i + 1) % 100 === 0 || i === customerIds.length - 1) {
        console.log(
          `✅ Progress: ${i + 1}/${customerIds.length} checked, ${
            existingIds.size
          } found existing`
        );
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`❌ Error checking customer ${customerId}:`, error.message);
    }
  }

  console.log(
    `🎯 Individual check completed: ${existingIds.size} existing out of ${customerIds.length} checked`
  );
  return existingIds;
}

async function syncCustomersToLarkBaseOptimizedV2(customers) {
  console.log(
    `🚀 ULTRA-FAST SYNC: Starting targeted sync for ${customers.length} customers...`
  );

  const startTime = Date.now();

  try {
    // Extract customer IDs for targeted checking
    const customerIds = customers
      .map((c) => c.id?.toString() || c.code)
      .filter(Boolean);

    // 🎯 OPTIMIZATION: Only check specific customer IDs (not all 52K!)
    const existingIds = await checkSpecificCustomersExist(customerIds);

    // Separate new vs existing customers
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

    // Step 3: Batch add new customers
    let newCount = 0;
    if (newCustomers.length > 0) {
      console.log(
        `➕ Adding ${newCustomers.length} new customers in batches...`
      );
      const addResults = await batchAddCustomersToLarkBase(newCustomers);
      newCount = addResults.filter((r) => r.success !== false).length;
    }

    // Step 4: Smart update existing customers
    let updateCount = 0;
    if (existingCustomers.length > 0) {
      console.log(
        `🔄 Updating ${existingCustomers.length} existing customers...`
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
      failed: customers.length - newCount - updateCount,
      duration: `${duration}s`,
      speedImprovement: `${Math.round(
        52156 / customers.length
      )}x less data fetched`,
    };

    console.log(`🎉 ULTRA-FAST SYNC COMPLETED:`, stats);

    return { success: true, stats, optimized: true };
  } catch (error) {
    console.error("❌ Ultra-fast sync failed:", error.message);
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

async function getAllCustomersFromLarkBase() {
  const token = await getCustomerSyncLarkToken();
  const allCustomers = [];
  let hasMore = true;
  let pageToken = undefined;
  let pageCount = 0;

  console.log(
    "📊 Fetching ALL customers from Lark Base for duplicate analysis..."
  );

  while (hasMore) {
    try {
      const params = {
        page_size: 500,
        fields: ["Mã Khách Hàng", "Tên Khách Hàng", "Ngày Tạo"], // Only fields we need
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
        allCustomers.push(...records);

        hasMore = response.data.data.has_more;
        pageToken = response.data.data.page_token;
        pageCount++;

        console.log(
          `📄 Page ${pageCount}: Found ${records.length} customers, total: ${allCustomers.length}`
        );
      } else {
        console.error("❌ Lark API Error:", response.data);
        break;
      }
    } catch (error) {
      console.error("❌ Error fetching customers:", error.message);
      break;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`✅ Total customers fetched: ${allCustomers.length}`);
  return allCustomers;
}

/**
 * Find duplicate customers by Customer Code only
 */
async function findDuplicateCustomersByCode() {
  console.log("🔍 Starting duplicate customer analysis by Customer Code...");

  const allCustomers = await getAllCustomersFromLarkBase();
  const duplicateGroups = [];

  console.log(
    `📊 Analyzing ${allCustomers.length} customers for code duplicates...`
  );

  // Group customers by Customer Code
  const codeGroups = {};

  allCustomers.forEach((record) => {
    const code = record.fields["Mã Khách Hàng"];
    if (code && code.trim() !== "") {
      const cleanCode = code.trim();
      if (!codeGroups[cleanCode]) {
        codeGroups[cleanCode] = [];
      }
      codeGroups[cleanCode].push(record);
    }
  });

  // Find groups with duplicates
  Object.entries(codeGroups).forEach(([code, records]) => {
    if (records.length > 1) {
      duplicateGroups.push({
        customerCode: code,
        records: records,
        count: records.length,
      });
    }
  });

  const summary = {
    totalCustomers: allCustomers.length,
    duplicateGroups: duplicateGroups.length,
    totalDuplicateRecords: duplicateGroups.reduce(
      (sum, group) => sum + group.count,
      0
    ),
    recordsToDelete: duplicateGroups.reduce(
      (sum, group) => sum + (group.count - 1),
      0
    ), // Keep 1, delete the rest
  };

  console.log("📊 DUPLICATE ANALYSIS BY CUSTOMER CODE:");
  console.log(`📋 Total customers: ${summary.totalCustomers}`);
  console.log(`🔄 Duplicate groups: ${summary.duplicateGroups}`);
  console.log(`📝 Total duplicate records: ${summary.totalDuplicateRecords}`);
  console.log(`🗑️ Records to delete: ${summary.recordsToDelete}`);

  return {
    duplicateGroups: duplicateGroups,
    summary: summary,
  };
}

/**
 * Show detailed duplicate analysis
 */
async function analyzeDuplicatesByCode() {
  console.log("🔍 Starting detailed duplicate analysis by Customer Code...");

  const result = await findDuplicateCustomersByCode();
  const { duplicateGroups, summary } = result;

  console.log("\n📊 DETAILED DUPLICATE ANALYSIS:");

  if (duplicateGroups.length > 0) {
    console.log(
      `\n📝 DUPLICATES BY CUSTOMER CODE (${duplicateGroups.length} groups):`
    );

    duplicateGroups.slice(0, 10).forEach((group, index) => {
      console.log(
        `\n   Group ${index + 1}: Code "${group.customerCode}" - ${
          group.count
        } records`
      );
      group.records.forEach((record, recordIndex) => {
        const createdDate = new Date(record.created_time).toLocaleString(
          "vi-VN"
        );
        console.log(
          `     ${recordIndex + 1}. ${
            record.fields["Tên Khách Hàng"]
          } | Created: ${createdDate} | ID: ${record.record_id}`
        );
      });
    });

    if (duplicateGroups.length > 10) {
      console.log(
        `\n   ... and ${duplicateGroups.length - 10} more duplicate groups`
      );
    }
  } else {
    console.log("\n✅ No duplicates found by Customer Code!");
  }

  return result;
}

/**
 * Delete duplicate customers by code (keep the newest record)
 */
async function deleteDuplicateCustomersByCode(dryRun = true) {
  console.log(
    `🗑️ Starting duplicate customer deletion by Customer Code (dryRun: ${dryRun})...`
  );

  if (!dryRun) {
    console.log(
      "⚠️ WARNING: This will permanently delete duplicate customer records!"
    );
    console.log(
      "⚠️ Make sure you have a backup of your Lark Base before proceeding!"
    );
  }

  const result = await findDuplicateCustomersByCode();
  const { duplicateGroups, summary } = result;

  if (duplicateGroups.length === 0) {
    console.log("✅ No duplicate customers found by Customer Code!");
    return {
      success: true,
      message: "No duplicates found",
      deletedCount: 0,
    };
  }

  const deletionPlan = [];

  // Plan deletions for each group (keep newest, delete older ones)
  duplicateGroups.forEach((group, groupIndex) => {
    // Sort by creation time - newest first
    const sortedRecords = group.records.sort((a, b) => {
      return (
        new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
      );
    });

    const recordToKeep = sortedRecords[0]; // Keep the newest
    const recordsToDelete = sortedRecords.slice(1); // Delete the rest

    deletionPlan.push({
      groupIndex: groupIndex + 1,
      customerCode: group.customerCode,
      totalRecords: group.count,
      recordToKeep: recordToKeep,
      recordsToDelete: recordsToDelete,
      deletionCount: recordsToDelete.length,
    });
  });

  // Show deletion plan
  console.log(`\n📋 DELETION PLAN (keep newest record):`);
  let totalDeletions = 0;

  deletionPlan.forEach((plan) => {
    console.log(
      `\nGroup ${plan.groupIndex}: Customer Code "${plan.customerCode}"`
    );
    console.log(`  📊 Total records: ${plan.totalRecords}`);

    const keepCreated = new Date(plan.recordToKeep.created_time).toLocaleString(
      "vi-VN"
    );
    console.log(
      `  ✅ Keep: ${plan.recordToKeep.fields["Tên Khách Hàng"]} (Created: ${keepCreated}) [${plan.recordToKeep.record_id}]`
    );

    console.log(`  🗑️ Delete: ${plan.deletionCount} older records`);
    plan.recordsToDelete.forEach((record, index) => {
      const deleteCreated = new Date(record.created_time).toLocaleString(
        "vi-VN"
      );
      console.log(
        `     ${index + 1}. ${
          record.fields["Tên Khách Hàng"]
        } (Created: ${deleteCreated}) [${record.record_id}]`
      );
    });

    totalDeletions += plan.deletionCount;
  });

  console.log(`\n📊 DELETION SUMMARY:`);
  console.log(`🗑️ Total records to delete: ${totalDeletions}`);
  console.log(`✅ Total records to keep: ${duplicateGroups.length}`);

  if (dryRun) {
    console.log("\n🔍 DRY RUN MODE - No records will be actually deleted");
    console.log("💡 Set dryRun: false to perform actual deletions");
    return {
      success: true,
      dryRun: true,
      deletionPlan: deletionPlan,
      totalDeletions: totalDeletions,
    };
  }

  // Perform actual deletions
  console.log(
    `\n🗑️ Starting actual deletion of ${totalDeletions} duplicate records...`
  );

  let successCount = 0;
  let failCount = 0;

  for (const plan of deletionPlan) {
    console.log(
      `\n🗑️ Processing group ${plan.groupIndex}: ${plan.customerCode}`
    );

    for (const recordToDelete of plan.recordsToDelete) {
      try {
        const deleteResult = await deleteLarkBaseRecord(
          recordToDelete.record_id
        );

        if (deleteResult.success) {
          successCount++;
          console.log(
            `  ✅ Deleted: ${recordToDelete.fields["Tên Khách Hàng"]} (${recordToDelete.record_id})`
          );
        } else {
          failCount++;
          console.log(
            `  ❌ Failed: ${recordToDelete.fields["Tên Khách Hàng"]} (${recordToDelete.record_id}) - ${deleteResult.error}`
          );
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        failCount++;
        console.log(
          `  ❌ Error deleting ${recordToDelete.record_id}: ${error.message}`
        );
      }
    }
  }

  console.log(`\n📊 DELETION COMPLETED:`);
  console.log(`✅ Successfully deleted: ${successCount} records`);
  console.log(`❌ Failed to delete: ${failCount} records`);
  console.log(`📊 Total processed: ${successCount + failCount} records`);

  return {
    success: failCount === 0,
    dryRun: false,
    deletionPlan: deletionPlan,
    totalDeletions: totalDeletions,
    successCount: successCount,
    failCount: failCount,
  };
}

/**
 * Delete a single record from Lark Base
 */
async function deleteLarkBaseRecord(recordId) {
  try {
    const token = await getCustomerSyncLarkToken();

    const response = await axios.delete(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0) {
      return { success: true };
    } else {
      return { success: false, error: response.data.msg || "Unknown error" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Quick check for duplicates by customer code
 */
async function quickDuplicateCheckByCode() {
  console.log("🔍 Quick duplicate check by Customer Code...");
  const result = await findDuplicateCustomersByCode();
  return result.summary;
}

module.exports = {
  addCustomerToLarkBase,
  updateCustomerInLarkBase,
  syncCustomersToLarkBase,
  sendLarkSyncNotification,
  mapCustomerToLarkFields,
  getCustomerSyncLarkToken,
  syncCustomersToLarkBaseOptimizedV2,
  batchAddCustomersToLarkBase,
  // getAllExistingCustomerIds,
  checkSpecificCustomersExist,
  getAllCustomersFromLarkBase,
  findDuplicateCustomersByCode,
  analyzeDuplicatesByCode,
  deleteDuplicateCustomersByCode,
  deleteLarkBaseRecord,
  quickDuplicateCheckByCode,
};
