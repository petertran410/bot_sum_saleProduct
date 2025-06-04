// src/lark.js - Extended with CRM Base functionality
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Cấu hình endpoints của Lark API
const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

// CRM Base configuration - Add these to your .env file
const CRM_BASE_TOKEN = process.env.LARK_CRM_BASE_TOKEN; // Your Base token
const CRM_TABLE_ID = process.env.LARK_CRM_TABLE_ID; // Your Table ID

/**
 * Lấy token truy cập từ Lark API
 * @returns {Promise<string>} Token truy cập
 */
async function getLarkToken() {
  try {
    const response = await axios.post(
      LARK_TOKEN_URL,
      {
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    return response.data.tenant_access_token;
  } catch (error) {
    console.error("Lỗi khi lấy Lark token:", error.message);
    if (error.response) {
      console.error("Phản hồi từ server:", error.response.status);
      console.error("Dữ liệu phản hồi:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

/**
 * CRM Base Functions - NEW FUNCTIONALITY
 */

/**
 * Get next STT number for CRM
 * @param {string} token - LarkSuite access token
 * @returns {Promise<number>} Next STT number
 */
async function getNextSTTNumber(token) {
  try {
    console.log("🔢 Getting next STT number...");

    const response = await axios.get(
      `${LARK_BASE_URL}/bitable/v1/apps/${CRM_BASE_TOKEN}/tables/${CRM_TABLE_ID}/records`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          page_size: 500,
          sort: '["STT desc"]', // Sort by STT descending
        },
      }
    );

    if (response.data.code === 0 && response.data.data.items.length > 0) {
      let highestSTT = 0;
      response.data.data.items.forEach((record) => {
        const sttValue = record.fields.STT;
        if (sttValue && typeof sttValue === "number" && sttValue > highestSTT) {
          highestSTT = sttValue;
        }
      });
      const nextSTT = highestSTT + 1;
      console.log(`✅ Next STT: ${nextSTT}`);
      return nextSTT;
    } else {
      console.log("📋 No existing records, starting with STT: 1");
      return 1;
    }
  } catch (error) {
    console.error("⚠️ Could not get next STT:", error.message);
    // Fallback: use timestamp-based STT
    const fallbackSTT = Date.now() % 1000000;
    console.log(`🔄 Using fallback STT: ${fallbackSTT}`);
    return fallbackSTT;
  }
}

/**
 * Format notes field for CRM
 * @param {Object} formData - Form submission data
 * @returns {string} Formatted notes
 */
function formatCRMNotes(formData) {
  const notes = [];

  if (formData.email) {
    notes.push(`📧 Email: ${formData.email}`);
  }

  if (formData.ticket) {
    notes.push(`🎫 Số vé đăng ký: ${formData.ticket}`);
  }

  if (formData.city) {
    notes.push(`📍 Sự kiện: ${formData.city}`);
  }

  notes.push(`🌐 Nguồn: Website Registration`);
  notes.push(`⏰ Đăng ký lúc: ${new Date().toLocaleString("vi-VN")}`);
  notes.push(`🆔 IP: ${formData.clientIP || "Unknown"}`);

  return notes.join("\n");
}

/**
 * Add record to CRM Base
 * @param {Object} formData - Form submission data
 * @returns {Promise<Object>} Created record
 */
async function addRecordToCRMBase(formData) {
  try {
    console.log("📝 Adding record to CRM Base...", formData);

    const token = await getLarkToken();
    const nextSTT = await getNextSTTNumber(token);

    // Map form data to CRM structure
    const recordData = {
      fields: {
        STT: nextSTT,
        "Tên khách hàng": formData.name,
        "Số điện thoại": formData.phone,
        "Nhu cầu": formData.type,
        "Người tạo": "Website Form",
        "Thời gian tạo": new Date().toISOString(),
        "Sales phụ trách": "",
        "Zalo khách hàng": "",
        "Ghi chú": formatCRMNotes(formData),
        "Trạng thái": "Mới",
        "Giá Trị Đơn Hàng": 0,
        "Last Modified Date": new Date().toISOString(),
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CRM_BASE_TOKEN}/tables/${CRM_TABLE_ID}/records`,
      recordData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code === 0) {
      const record = response.data.data.record;
      console.log(
        `✅ CRM record created successfully: ${record.record_id} (STT: ${nextSTT})`
      );

      // Also send notification to group chat
      await sendCRMNotificationToGroup(formData, nextSTT);

      return {
        success: true,
        record_id: record.record_id,
        stt: nextSTT,
        data: record,
      };
    } else {
      throw new Error(`Failed to add CRM record: ${response.data.msg}`);
    }
  } catch (error) {
    console.error("❌ Error adding record to CRM Base:", error.message);
    throw error;
  }
}

/**
 * Send notification to group about new CRM entry
 * @param {Object} formData - Form data
 * @param {number} stt - STT number
 */
async function sendCRMNotificationToGroup(formData, stt) {
  try {
    const token = await getLarkToken();

    const message = {
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: "🎯 New Workshop Registration - CRM Updated",
          },
          template: "green",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**🆔 STT:** ${stt}\n**👤 Khách hàng:** ${formData.name}\n**📱 Điện thoại:** ${formData.phone}`,
            },
          },
          {
            tag: "div",
            fields: [
              {
                is_short: true,
                text: {
                  tag: "lark_md",
                  content: `**📧 Email:**\n${formData.email}`,
                },
              },
              {
                is_short: true,
                text: {
                  tag: "lark_md",
                  content: `**🎫 Số vé:**\n${formData.ticket}`,
                },
              },
            ],
          },
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**🏢 Nhu cầu:** ${formData.type}\n**📍 Sự kiện:** ${formData.city}`,
            },
          },
          {
            tag: "hr",
          },
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: `**📊 Trạng thái:** Mới\n**👔 Sales phụ trách:** Chưa phân công\n**⏰ Thời gian:** ${new Date().toLocaleString(
                "vi-VN"
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
                  content: "📋 Mở CRM",
                },
                type: "primary",
                url: `https://dieptra2018.sg.larksuite.com/base/${CRM_BASE_TOKEN}?table=${CRM_TABLE_ID}&view=vewdQ1aYB2`,
              },
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "📞 Gọi khách",
                },
                type: "default",
                url: `tel:${formData.phone}`,
              },
            ],
          },
        ],
      },
    };

    if (process.env.LARK_CHAT_ID) {
      const response = await axios.post(
        `${LARK_BASE_URL}/message/v4/send`,
        {
          chat_id: process.env.LARK_CHAT_ID,
          ...message,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📢 CRM notification sent to group");
      return response.data;
    }
  } catch (error) {
    console.error("⚠️ Failed to send CRM notification:", error.message);
  }
}

/**
 * Get CRM statistics
 * @returns {Promise<Object>} CRM stats
 */
async function getCRMStats() {
  try {
    const token = await getLarkToken();

    const response = await axios.get(
      `${LARK_BASE_URL}/bitable/v1/apps/${CRM_BASE_TOKEN}/tables/${CRM_TABLE_ID}/records`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          page_size: 500,
        },
      }
    );

    if (response.data.code === 0) {
      const records = response.data.data.items;
      const stats = {
        total: records.length,
        new: records.filter((r) => r.fields["Trạng thái"] === "Mới").length,
        contacted: records.filter(
          (r) => r.fields["Trạng thái"] === "Đang liên hệ"
        ).length,
        interested: records.filter((r) => r.fields["Trạng thái"] === "Quan tâm")
          .length,
        closed: records.filter((r) => r.fields["Trạng thái"] === "Đã chốt")
          .length,
        totalValue: records.reduce(
          (sum, r) => sum + (r.fields["Giá Trị Đơn Hàng"] || 0),
          0
        ),
        todayCount: records.filter((r) => {
          const createDate = new Date(r.fields["Thời gian tạo"]);
          const today = new Date();
          return createDate.toDateString() === today.toDateString();
        }).length,
      };

      return stats;
    }

    return null;
  } catch (error) {
    console.error("❌ Error getting CRM stats:", error.message);
    return null;
  }
}

// Export existing functions and new CRM functions
module.exports = {
  // Existing functions
  getLarkToken,

  // New CRM functions
  addRecordToCRMBase,
  sendCRMNotificationToGroup,
  getCRMStats,
  getNextSTTNumber,
  formatCRMNotes,
};
