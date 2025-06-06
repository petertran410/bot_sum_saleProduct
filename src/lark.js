// src/lark.js - Updated with CORRECT Base IDs and improved error handling
const axios = require("axios");

// Lark API Configuration
const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

// ✅ CRM Base Configuration - Using environment variables
const CRM_BASE_TOKEN = process.env.LARK_CRM_BASE_TOKEN;
const CRM_TABLE_ID = process.env.LARK_CRM_TABLE_ID;

/**
 * Get Lark access token
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
    console.error("❌ Error getting Lark token:", error.message);
    if (error.response) {
      console.error("📄 Response status:", error.response.status);
      console.error("📄 Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

/**
 * ✅ Add record to CRM Base with CORRECT field mapping
 */
async function addRecordToCRMBase(formData) {
  try {
    console.log(
      "📝 Adding record to CRM Base with correct field mapping...",
      formData
    );

    // Validate required environment variables
    if (!CRM_BASE_TOKEN || !CRM_TABLE_ID) {
      throw new Error(
        "Missing CRM Base configuration. Please check LARK_CRM_BASE_TOKEN and LARK_CRM_TABLE_ID in .env"
      );
    }

    const token = await getLarkToken();

    // ✅ CORRECT MAPPING: Form data -> Base field names (exact match with Base schema)
    const recordData = {
      fields: {
        "Họ và tên": formData.name, // ✅ name -> "Họ và tên"
        "Số điện thoại": formData.phone, // ✅ phone -> "Số điện thoại"
        "Mô hình kinh doanh": formData.type, // ✅ type -> "Mô hình kinh doanh"
        "Số vé đăng ký": parseInt(formData.ticket) || 1, // ✅ ticket -> "Số vé đăng ký" (Number)
        Workshop: formData.city, // ✅ city -> "Workshop"

        // Additional info in notes
        "Ghi chú": formatDetailedNotes(formData),
      },
    };

    console.log(
      "📤 Sending correctly mapped data:",
      JSON.stringify(recordData, null, 2)
    );

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CRM_BASE_TOKEN}/tables/${CRM_TABLE_ID}/records`,
      recordData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    if (response.data.code === 0) {
      const record = response.data.data.record;
      const autoSTT =
        record.fields.STT || record.fields["STT"] || Date.now() % 10000;

      console.log(
        `✅ CRM record created successfully: ${record.record_id} (STT: ${autoSTT})`
      );

      // Send notification to team
      await sendCRMNotificationToGroup(formData, autoSTT);

      return {
        success: true,
        record_id: record.record_id,
        stt: autoSTT,
        data: record,
      };
    } else {
      console.error("📄 LarkSuite API Error:", response.data);
      throw new Error(
        `Failed to add CRM record: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.error("❌ Error adding record to CRM Base:", error.message);
    if (error.response) {
      console.error("📄 API Error Details:", error.response.data);
      console.error("📄 Status:", error.response.status);
    }

    // Return a more user-friendly error
    const userError =
      error.response?.status === 403
        ? "Không có quyền truy cập CRM. Vui lòng kiểm tra token."
        : error.response?.status === 404
        ? "Không tìm thấy Base hoặc Table. Vui lòng kiểm tra Base ID."
        : "Lỗi hệ thống CRM. Vui lòng thử lại sau.";

    throw new Error(userError);
  }
}

/**
 * Format detailed notes including email and metadata
 */
function formatDetailedNotes(formData) {
  const notes = [];

  // Email information (since it's not a separate field in Base)
  if (formData.email) {
    notes.push(`📧 Email: ${formData.email}`);
  }

  // Source and timestamp
  notes.push(`🌐 Nguồn: Website Registration`);
  notes.push(
    `⏰ Đăng ký lúc: ${new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    })}`
  );

  // Technical info for troubleshooting
  if (formData.clientIP) {
    notes.push(`🆔 IP: ${formData.clientIP}`);
  }

  if (formData.userAgent) {
    const shortUA =
      formData.userAgent.length > 100
        ? formData.userAgent.substring(0, 100) + "..."
        : formData.userAgent;
    notes.push(`🖥️ Device: ${shortUA}`);
  }

  return notes.join("\n");
}

/**
 * ✅ Enhanced notification with correct Base URL
 */
async function sendCRMNotificationToGroup(formData, autoGeneratedSTT) {
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
              content: `**🆔 STT:** ${autoGeneratedSTT}\n**👤 Họ và tên:** ${formData.name}\n**📱 Số điện thoại:** ${formData.phone}`,
            },
          },
          {
            tag: "div",
            fields: [
              {
                is_short: true,
                text: {
                  tag: "lark_md",
                  content: `**📧 Email:**\n${formData.email || "Không có"}`,
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
              content: `**🏢 Mô hình kinh doanh:** ${formData.type}\n**🎪 Workshop:** ${formData.city}`,
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
                  content: "📋 Mở CRM",
                },
                type: "primary",
                // ✅ CORRECT URL với view ID chính xác từ Base URL của bạn
                url: `https://dieptra2018.sg.larksuite.com/base/${CRM_BASE_TOKEN}?table=${CRM_TABLE_ID}&view=vewIia5G5j`,
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
          timeout: 5000, // 5 second timeout for notifications
        }
      );

      console.log("📢 CRM notification sent to group");
      return response.data;
    } else {
      console.log(
        "⚠️ LARK_CHAT_ID not configured. Skipping group notification."
      );
    }
  } catch (error) {
    console.error(
      "⚠️ Failed to send CRM notification (non-critical):",
      error.message
    );
    // Don't throw error for notification failures - it's not critical
  }
}

/**
 * Get CRM statistics
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
        todayCount: records.filter((r) => {
          const createDate = new Date(r.created_time);
          const today = new Date();
          return createDate.toDateString() === today.toDateString();
        }).length,
        lastWeekCount: records.filter((r) => {
          const createDate = new Date(r.created_time);
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return createDate >= weekAgo;
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

// Export functions
module.exports = {
  getLarkToken,
  addRecordToCRMBase,
  sendCRMNotificationToGroup,
  getCRMStats,
  formatDetailedNotes,
};
