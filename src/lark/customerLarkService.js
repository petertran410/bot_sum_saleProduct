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

/**
 * Map KiotViet customer data to Lark Base fields
 */
function mapCustomerToLarkFields(customer) {
  return {
    // Primary field - use KiotViet customer ID
    Id: customer.id?.toString() || "",

    // Customer identification
    "Mã Khách Hàng": customer.code || "",
    "Tên Khách Hàng": customer.name || "",

    // Contact information
    "Số Điện Thoại": customer.contactNumber || "",
    Email: customer.email || "",

    // Address information
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",

    // Business information
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",

    // Financial information
    "Nợ Hiện Tại": customer.debt ? customer.debt.toString() : "0",
    "Tổng Bán": customer.totalInvoiced
      ? customer.totalInvoiced.toString()
      : "0",
    "Điểm Hiện Tại": customer.rewardPoint
      ? customer.rewardPoint.toString()
      : "0",

    // Store information
    "Id Cửa Hàng": customer.retailerId?.toString() || "",

    // Dates - format for Lark datetime fields
    "Ngày Tạo": customer.createdDate
      ? formatDateForLark(customer.createdDate)
      : null,
    "Thời Gian Cập Nhật": customer.modifiedDate
      ? formatDateForLark(customer.modifiedDate)
      : formatDateForLark(new Date()),

    // Gender - map to Lark single select options
    "Giới tính": mapGenderToLarkOption(customer.gender),

    // Notes
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
  console.log(`🚀 Starting Lark sync for ${customers.length} customers...`);

  let successCount = 0;
  let failCount = 0;
  let updateCount = 0;
  let newCount = 0;
  const BATCH_SIZE = 10; // Process in smaller batches to avoid API limits

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
          // Validate customer data
          if (!customer.id || !customer.name) {
            console.warn(
              `Skipping invalid customer: ${customer.code || "unknown"}`
            );
            failCount++;
            continue;
          }

          const result = await addCustomerToLarkBase(customer);

          if (result.success) {
            successCount++;
            if (result.updated) {
              updateCount++;
            } else {
              newCount++;
            }
          } else {
            failCount++;
          }

          // Small delay between requests to respect API limits
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          console.error(
            `Error processing customer ${customer.code}:`,
            error.message
          );
          failCount++;
        }
      }

      // Longer delay between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `📊 Lark sync completed: ${newCount} new, ${updateCount} updated, ${failCount} failed`
    );

    return {
      success: failCount === 0,
      stats: {
        total: customers.length,
        success: successCount,
        newRecords: newCount,
        updated: updateCount,
        failed: failCount,
      },
    };
  } catch (error) {
    console.error("❌ Lark customer sync failed:", error.message);
    return {
      success: false,
      error: error.message,
      stats: {
        total: customers.length,
        success: successCount,
        newRecords: newCount,
        updated: updateCount,
        failed: failCount,
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

module.exports = {
  addCustomerToLarkBase,
  updateCustomerInLarkBase,
  syncCustomersToLarkBase,
  sendLarkSyncNotification,
  mapCustomerToLarkFields,
  getCustomerSyncLarkToken, // Export the new token function
};
