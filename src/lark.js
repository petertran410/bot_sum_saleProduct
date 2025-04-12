// src/lark.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
// const LARK_TOKEN = process.env.LARK_USER_TOKEN;
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const getLarkToken = async () => {
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
    console.log("Error getting lark token", error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
};

async function getUserOpenId(email = null) {
  try {
    const token = await getLarkToken();

    let url;
    let data = {};

    if (email) {
      // Nếu có email, tìm người dùng theo email
      url =
        "https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id";
      data = {
        emails: [email],
      };
    } else {
      // Nếu không, lấy thông tin người dùng hiện tại (người gọi API)
      url = "https://open.larksuite.com/open-apis/contact/v3/users/me";
    }

    const response = await axios({
      method: email ? "POST" : "GET",
      url: url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: email ? data : undefined,
    });

    console.log("API Response:", JSON.stringify(response.data, null, 2));

    if (email) {
      // Xử lý kết quả khi tìm theo email
      if (
        response.data.data.user_list &&
        response.data.data.user_list.length > 0
      ) {
        return response.data.data.user_list[0].user_id;
      }
      return null;
    } else {
      // Xử lý kết quả khi lấy người dùng hiện tại
      return response.data.data.user_id;
    }
  } catch (error) {
    console.error("Error getting user open_id:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    return null;
  }
}

async function sendReport(changedOrders) {
  try {
    const token = await getLarkToken();
    console.log("Starting to send report to Lark...");
    const today = new Date().toLocaleDateString("vi-VN");

    let content = `**Đơn hàng thay đổi ngày ${today}**\n\nCập nhật lúc: ${new Date().toLocaleTimeString(
      "vi-VN"
    )}\n\n`;

    if (changedOrders && changedOrders.length > 0) {
      changedOrders.forEach((order) => {
        const changeType =
          order.changeType === "new"
            ? "🆕 ĐƠN HÀNG MỚI"
            : "🔄 ĐƠN HÀNG CẬP NHẬT";
        content += `**${changeType}**\n`;

        content += `**Mã đơn:** ${order.code || "N/A"}\n`;
        content += `**Ngày tạo đơn:** ${order.createdDate || "N/A"}\n`;
        content += `**Khách hàng:** ${order.customerName || "N/A"}\n`;
        content += `**Chi nhánh:** ${order.branchName || "N/A"}\n`;
        content += `**Người lên đơn:** ${order.soldByName || "N/A"}\n`;

        if (order.orderDetails && order.orderDetails.length > 0) {
          content += `**Sản phẩm:** ${order.orderDetails
            .map((item) => `${item.productName} (${item.quantity})`)
            .join(", ")}\n`;
        }

        content += `**Tổng tiền:** ${
          order.total ? order.total.toLocaleString("vi-VN") : "0"
        }đ\n`;

        if (order.description) {
          content += `**Ghi chú:** ${order.description}\n`;
        }

        content += `**Trạng thái:** ${order.statusValue || "N/A"}\n\n`;
        content += "---\n\n";
      });
    } else {
      content += "Không có đơn hàng thay đổi";
    }

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `Đơn hàng thay đổi (${today})`,
          },
          template: "blue",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Lark API response:", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("Error sending report to Lark:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function sendNotification(order) {
  try {
    const token = await getLarkToken();

    const cardContent = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: "THÔNG BÁO: Đơn hàng sửa do thiếu hàng",
        },
        template: "red",
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**Mã đơn:** ${order.code || "N/A"}\n**Khách hàng:** ${
              order.customerName || "N/A"
            }\n**Ghi chú:** ${order.description || "N/A"}`,
          },
        },
      ],
    };

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: cardContent,
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("Error sending notification to Lark:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function sendTestMessage() {
  try {
    const token = await getLarkToken();

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "text",
      content: {
        text: "Test message from KiotViet integration",
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Test message response:", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("Error sending test message:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function sendSingleOrderReport(order) {
  try {
    const token = await getLarkToken();
    const today = new Date().toLocaleDateString("vi-VN");
    const changeType =
      order.changeType === "new" ? "🆕 ĐƠN HÀNG MỚI" : "🔄 ĐƠN HÀNG CẬP NHẬT";

    let content = `**${changeType}**\n\n`;
    content += `**Mã đơn:** ${order.code || "N/A"}\n`;
    content += `**Ngày tạo đơn:** ${
      new Date(order.createdDate).toLocaleString("vi-VN") || "N/A"
    }\n`;
    content += `**Khách hàng:** ${order.customerName || "N/A"}\n`;
    content += `**Chi nhánh:** ${order.branchName || "N/A"}\n`;
    content += `**Người lên đơn:** ${order.soldByName || "N/A"}\n`;

    if (order.orderDetails && order.orderDetails.length > 0) {
      content += `**Sản phẩm:** ${order.orderDetails
        .map((item) => `${item.productName} (${item.quantity})`)
        .join(", ")}\n`;
    }

    content += `**Tổng tiền:** ${
      order.total ? order.total.toLocaleString("vi-VN") : "0"
    }đ\n`;

    if (order.description) {
      content += `**Ghi chú:** ${order.description || "Không có"}\n`;
    }

    content += `**Trạng thái:** ${order.statusValue || "N/A"}\n`;

    content += `**Thời gian cập nhật:** ${new Date(
      order.modifiedDate
    ).toLocaleString("vi-VN")}`;

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `${changeType} - ${order.code}`,
          },

          template: order.changeType === "new" ? "green" : "orange",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error sending notification for order ${order.code}:`,
      error.message
    );
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

async function sendSingleInvoiceReport(invoice) {
  try {
    const token = await getLarkToken();

    // Xác định tiêu đề thông báo dựa trên loại thay đổi
    let titlePrefix = "Hóa đơn:";
    let templateColor = "blue";

    if (invoice.changeType === "revised") {
      titlePrefix = "Hóa đơn được chỉnh sửa:";
      templateColor = "yellow";
    } else if (invoice.changeType === "canceled") {
      titlePrefix = "Hóa đơn bị hủy:";
      templateColor = "red";
    }

    // Đơn giản hóa nội dung thông báo
    let content = `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;

    // Thêm thông tin về phiên bản nếu có
    if (invoice.additionalInfo) {
      content += `**Trạng thái chỉnh sửa:** ${invoice.additionalInfo}\n`;
    } else if (invoice.changeType === "canceled") {
      content += `**Trạng thái:** Hóa đơn đã bị hủy\n`;
    }

    // Thêm thông tin về phiên bản trước đó nếu có
    if (invoice.previousVersionCode) {
      content += `**So sánh với phiên bản:** ${invoice.previousVersionCode}\n`;
    }

    content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
    content += `**Người lập:** ${invoice.soldByName || "N/A"}\n`;
    content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;

    if (invoice.orderCode) {
      content += `**Mã đơn hàng:** ${invoice.orderCode}\n`;
    }

    // Hiển thị tổng tiền với thông tin thay đổi nếu có
    if (invoice.productChanges && invoice.productChanges.totalChanged) {
      content += `**Tổng tiền:** ${invoice.total.toLocaleString(
        "vi-VN"
      )} đ (Giá tiền cũ: ${invoice.productChanges.oldTotal.toLocaleString(
        "vi-VN"
      )} đ)\n\n`;
    } else {
      content += `**Tổng tiền:** ${
        invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"
      } đ\n\n`;
    }

    // Hiển thị thông tin về sản phẩm trong hóa đơn và sự thay đổi
    if (invoice.productChanges) {
      // Trước tiên, hiển thị tất cả sản phẩm hiện có trong hóa đơn mới
      if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
        content += `**Sản phẩm trong hóa đơn hiện tại:**\n`;
        invoice.invoiceDetails.forEach((item, index) => {
          // Kiểm tra xem sản phẩm này có thay đổi số lượng không
          let quantityChangeInfo = "";
          if (invoice.productChanges.changed) {
            const changedProduct = invoice.productChanges.changed.find(
              (changed) => changed.product.productId === item.productId
            );

            if (changedProduct) {
              const changeType =
                changedProduct.difference > 0 ? "tăng" : "giảm";
              quantityChangeInfo = ` (${changeType} từ ${changedProduct.originalQuantity} thành ${changedProduct.newQuantity})`;
            }
          }

          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }${quantityChangeInfo}\n`;
        });
        content += "\n";
      }

      // Sau đó, hiển thị các sản phẩm đã bị xóa
      if (
        invoice.productChanges.removed &&
        invoice.productChanges.removed.length > 0
      ) {
        content += `**Sản phẩm đã bị xóa:**\n`;
        invoice.productChanges.removed.forEach((item, index) => {
          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }\n`;
        });
        content += "\n";
      }

      // Cuối cùng, hiển thị các sản phẩm mới thêm
      if (
        invoice.productChanges.added &&
        invoice.productChanges.added.length > 0
      ) {
        content += `**Sản phẩm thêm mới:**\n`;
        invoice.productChanges.added.forEach((item, index) => {
          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }\n`;
        });
        content += "\n";
      }
    } else if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
      // Nếu không có thông tin so sánh, chỉ hiển thị danh sách sản phẩm
      content += `**Sản phẩm:**\n`;
      invoice.invoiceDetails.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += "\n";
    }

    content += `**Trạng thái:** ${invoice.statusValue || "N/A"}\n`;

    if (invoice.description && invoice.description.trim() !== "") {
      content += `**Ghi chú:** ${invoice.description}\n`;
    }

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `${titlePrefix} ${invoice.code}`,
          },
          template: templateColor,
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      },
    };

    const response = await axios.post(
      `https://open.larksuite.com/open-apis/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error sending invoice notification for ${invoice.code}:`,
      error.message
    );
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Hàm gửi tin nhắn test chỉ đến admin
async function sendInvoiceNotificationToAdmin(invoice) {
  try {
    const token = await getLarkToken();

    // Check if the invoice creator is "admin"
    const creatorName = invoice.soldByName;
    if (creatorName !== "admin") {
      console.log(`Skipping message to ${creatorName} since they're not admin`);
      return null;
    }

    // Use the admin's open_id configured in environment variables
    const adminOpenId = process.env.LARK_USER_ID;

    if (!adminOpenId) {
      console.error("LARK_USER_ID not configured in environment variables");
      return null;
    }

    // Determine change type
    let changeTypeText = "được cập nhật";
    let emoji = "📝";

    if (invoice.changeType === "revised") {
      changeTypeText = "được chỉnh sửa";
      emoji = "✏️";
    } else if (invoice.changeType === "canceled") {
      changeTypeText = "đã bị hủy";
      emoji = "❌";
    } else if (invoice.changeType === "new") {
      changeTypeText = "mới được tạo";
      emoji = "🆕";
    }

    // Prepare simple text message
    const messageText = `${emoji} [TIN NHẮN TEST] Hóa đơn ${
      invoice.code
    } ${changeTypeText}
- Người lập: ${creatorName}
- Khách hàng: ${invoice.customerName || "N/A"}
- Tổng tiền: ${invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"}đ
- Trạng thái: ${invoice.statusValue || "N/A"}
- Thời gian: ${new Date().toLocaleString("vi-VN")}`;

    // Send text message
    const data = {
      receive_id: adminOpenId,
      msg_type: "text",
      content: JSON.stringify({ text: messageText }),
    };

    const response = await axios.post(
      "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id",
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    console.log(`Test notification sent to admin (${adminOpenId})`);
    return response.data;
  } catch (error) {
    console.error(`Error sending test notification to admin: ${error.message}`);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    return null;
  }
}

// Function to get a user's open_id from their email
async function getUserOpenId(email = null) {
  try {
    const token = await getLarkToken();

    let url;
    let data = {};

    if (email) {
      // If email is provided, find user by email
      url =
        "https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id";
      data = {
        emails: [email],
      };
    } else {
      // If not, get current user info (API caller)
      url = "https://open.larksuite.com/open-apis/contact/v3/users/me";
    }

    const response = await axios({
      method: email ? "POST" : "GET",
      url: url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: email ? data : undefined,
    });

    console.log("API Response:", JSON.stringify(response.data, null, 2));

    if (email) {
      // Handle result when searching by email
      if (
        response.data.data.user_list &&
        response.data.data.user_list.length > 0
      ) {
        return response.data.data.user_list[0].user_id;
      }
      return null;
    } else {
      // Handle result when getting current user
      return response.data.data.user_id;
    }
  } catch (error) {
    console.error("Error getting user open_id:", error.message);
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    return null;
  }
}

// Function to get user mapping by KiotViet username
function getUserMappingByKiotVietName(kiotVietName) {
  try {
    const mappingFilePath = path.resolve(process.cwd(), "user-mappings.json");
    if (!fs.existsSync(mappingFilePath)) {
      console.error(`Mapping file not found at: ${mappingFilePath}`);
      return null;
    }

    const data = fs.readFileSync(mappingFilePath, "utf8");
    const mappings = JSON.parse(data);

    const mapping = mappings.mappings.find(
      (mapping) => mapping.kiotVietName === kiotVietName
    );

    return mapping || null;
  } catch (error) {
    console.error(`Error getting user mapping: ${error.message}`);
    return null;
  }
}

// Function to send invoice notification to the invoice creator
async function sendInvoiceNotificationToCreator(invoice) {
  try {
    const token = await getLarkToken();

    // Get the creator name from the invoice
    const creatorName = invoice.soldByName;
    if (!creatorName) {
      console.error("Cannot send notification: No soldByName found in invoice");
      return null;
    }

    // Get mapping from configuration file
    const userMapping = getUserMappingByKiotVietName(creatorName);

    // Only proceed if a mapping was found
    if (!userMapping) {
      console.log(
        `No mapping found for "${creatorName}", skipping notification`
      );
      return null;
    }

    const receiverId = userMapping.larkOpenId;
    const displayName = userMapping.displayName;

    console.log(`Will send notification to: ${displayName} (${receiverId})`);

    // Xác định tiêu đề thông báo dựa trên loại thay đổi
    let titlePrefix = "Hóa đơn:";
    let templateColor = "blue";

    if (invoice.changeType === "revised") {
      titlePrefix = "Hóa đơn được chỉnh sửa:";
      templateColor = "yellow";
    } else if (invoice.changeType === "canceled") {
      titlePrefix = "Hóa đơn bị hủy:";
      templateColor = "red";
    }

    // Đơn giản hóa nội dung thông báo
    let content = `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;

    // Thêm thông tin về phiên bản nếu có
    if (invoice.additionalInfo) {
      content += `**Trạng thái chỉnh sửa:** ${invoice.additionalInfo}\n`;
    } else if (invoice.changeType === "canceled") {
      content += `**Trạng thái:** Hóa đơn đã bị hủy\n`;
    }

    // Thêm thông tin về phiên bản trước đó nếu có
    if (invoice.previousVersionCode) {
      content += `**So sánh với phiên bản:** ${invoice.previousVersionCode}\n`;
    }

    content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
    content += `**Người lập:** ${invoice.soldByName || "N/A"}\n`;
    content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;

    if (invoice.orderCode) {
      content += `**Mã đơn hàng:** ${invoice.orderCode}\n`;
    }

    // Hiển thị tổng tiền với thông tin thay đổi nếu có
    if (invoice.productChanges && invoice.productChanges.totalChanged) {
      content += `**Tổng tiền:** ${invoice.total.toLocaleString(
        "vi-VN"
      )} đ (Giá tiền cũ: ${invoice.productChanges.oldTotal.toLocaleString(
        "vi-VN"
      )} đ)\n\n`;
    } else {
      content += `**Tổng tiền:** ${
        invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"
      } đ\n\n`;
    }

    // Hiển thị thông tin về sản phẩm trong hóa đơn và sự thay đổi
    if (invoice.productChanges) {
      // Trước tiên, hiển thị tất cả sản phẩm hiện có trong hóa đơn mới
      if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
        content += `**Sản phẩm trong hóa đơn hiện tại:**\n`;
        invoice.invoiceDetails.forEach((item, index) => {
          // Kiểm tra xem sản phẩm này có thay đổi số lượng không
          let quantityChangeInfo = "";
          if (invoice.productChanges.changed) {
            const changedProduct = invoice.productChanges.changed.find(
              (changed) => changed.product.productId === item.productId
            );

            if (changedProduct) {
              const changeType =
                changedProduct.difference > 0 ? "tăng" : "giảm";
              quantityChangeInfo = ` (${changeType} từ ${changedProduct.originalQuantity} thành ${changedProduct.newQuantity})`;
            }
          }

          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }${quantityChangeInfo}\n`;
        });
        content += "\n";
      }

      // Sau đó, hiển thị các sản phẩm đã bị xóa
      if (
        invoice.productChanges.removed &&
        invoice.productChanges.removed.length > 0
      ) {
        content += `**Sản phẩm đã bị xóa:**\n`;
        invoice.productChanges.removed.forEach((item, index) => {
          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }\n`;
        });
        content += "\n";
      }

      // Cuối cùng, hiển thị các sản phẩm mới thêm
      if (
        invoice.productChanges.added &&
        invoice.productChanges.added.length > 0
      ) {
        content += `**Sản phẩm thêm mới:**\n`;
        invoice.productChanges.added.forEach((item, index) => {
          content += `${index + 1}. ${item.productName} - SL: ${
            item.quantity
          }\n`;
        });
        content += "\n";
      }
    } else if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
      // Nếu không có thông tin so sánh, chỉ hiển thị danh sách sản phẩm
      content += `**Sản phẩm:**\n`;
      invoice.invoiceDetails.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += "\n";
    }

    content += `**Trạng thái:** ${invoice.statusValue || "N/A"}\n`;

    if (invoice.description && invoice.description.trim() !== "") {
      content += `**Ghi chú:** ${invoice.description}\n`;
    }

    // Send the message
    const data = {
      receive_id: receiverId,
      msg_type: "interactive",
      content: JSON.stringify({
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `${titlePrefix} ${invoice.code}`,
          },
          template: templateColor,
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      }),
      receive_id_type: "open_id",
    };

    const response = await axios.post(
      "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id",
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    console.log(
      `Notification sent to ${displayName} for invoice ${invoice.code}`
    );
    return response.data;
  } catch (error) {
    console.error(`Error sending notification to creator: ${error.message}`);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    return null;
  }
}

async function getUserOpenIdByEmail(email) {
  try {
    const token = await getLarkToken();

    const response = await axios({
      method: "POST",
      url: "https://open.larksuite.com/open-apis/contact/v3/users/batch_get_id",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: {
        emails: [email],
      },
    });

    if (
      response.data.data.user_list &&
      response.data.data.user_list.length > 0
    ) {
      return response.data.data.user_list[0].user_id;
    }
    return null;
  } catch (error) {
    console.error(`Error getting open_id for ${email}:`, error.message);
    return null;
  }
}

async function sendOrderInvoiceComparisonReport(comparison) {
  try {
    const token = await getLarkToken();
    const today = new Date().toLocaleDateString("vi-VN");

    const order = comparison.order;
    const invoice = comparison.invoice;
    const differences = comparison.differences;

    let content = `**So sánh Đơn hàng và Hóa đơn**\n\n`;
    content += `**Mã đơn hàng:** ${order.code || "N/A"}\n`;
    content += `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;
    content += `**Ngày tạo đơn hàng:** ${
      new Date(order.createdDate).toLocaleString("vi-VN") || "N/A"
    }\n`;
    content += `**Ngày tạo hóa đơn:** ${
      new Date(invoice.createdDate).toLocaleString("vi-VN") || "N/A"
    }\n`;
    content += `**Khách hàng:** ${order.customerName || "N/A"}\n`;
    content += `**Chi nhánh:** ${order.branchName || "N/A"}\n`;
    content += `**Người lên đơn:** ${order.soldByName || "N/A"}\n\n`;

    content += `**Sự khác biệt:**\n`;

    // Hiển thị sản phẩm đã thêm vào hóa đơn
    if (differences.addedProducts && differences.addedProducts.length > 0) {
      content += `**Sản phẩm thêm mới (có trong hóa đơn nhưng không có trong đơn hàng):**\n`;
      differences.addedProducts.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }
    // Hiển thị sản phẩm đã bị xóa khỏi hóa đơn
    if (differences.removedProducts && differences.removedProducts.length > 0) {
      content += `**Sản phẩm bị xóa (có trong đơn hàng nhưng không có trong hóa đơn):**\n`;
      differences.removedProducts.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }

    // Hiển thị sản phẩm thay đổi số lượng
    if (differences.quantityChanges && differences.quantityChanges.length > 0) {
      content += `**Sản phẩm thay đổi số lượng:**\n`;
      differences.quantityChanges.forEach((change, index) => {
        const changeType = change.difference > 0 ? "tăng" : "giảm";
        content += `${index + 1}. ${
          change.product.productName
        } - ${changeType} từ ${change.orderQuantity} thành ${
          change.invoiceQuantity
        }\n`;
      });
      content += `\n`;
    }

    content += `**Tổng tiền đơn hàng:** ${
      order.total ? order.total.toLocaleString("vi-VN") : "0"
    }đ\n`;
    content += `**Tổng tiền hóa đơn:** ${
      invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"
    }đ\n\n`;

    content += `**Trạng thái đơn hàng:** ${order.statusValue || "N/A"}\n`;
    content += `**Trạng thái hóa đơn:** ${invoice.statusValue || "N/A"}\n`;

    if (order.description) {
      content += `**Ghi chú đơn hàng:** ${order.description || "Không có"}\n`;
    }

    if (invoice.description) {
      content += `**Ghi chú hóa đơn:** ${invoice.description || "Không có"}\n`;
    }

    content += `**Thời gian so sánh:** ${new Date().toLocaleString("vi-VN")}`;

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `So sánh Đơn hàng ${order.code} và Hóa đơn ${invoice.code}`,
          },
          template: "orange",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error sending order-invoice comparison report:`,
      error.message
    );
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Hàm gửi báo cáo so sánh các phiên bản hóa đơn
async function sendInvoiceVersionComparisonReport(comparison) {
  try {
    const token = await getLarkToken();

    const originalInvoice = comparison.originalInvoice;
    const revisedInvoice = comparison.revisedInvoice;
    const differences = comparison.differences;
    const versionInfo = comparison.versionInfo;

    let content = `**So sánh các phiên bản Hóa đơn**\n\n`;
    content += `**Hóa đơn gốc:** ${originalInvoice.code || "N/A"}\n`;
    content += `**Hóa đơn điều chỉnh:** ${revisedInvoice.code || "N/A"}\n`;
    content += `**Phiên bản điều chỉnh:** ${versionInfo.version || "N/A"}\n`;
    content += `**Ngày tạo hóa đơn gốc:** ${
      new Date(originalInvoice.createdDate).toLocaleString("vi-VN") || "N/A"
    }\n`;
    content += `**Ngày tạo hóa đơn điều chỉnh:** ${
      new Date(revisedInvoice.createdDate).toLocaleString("vi-VN") || "N/A"
    }\n`;
    content += `**Khách hàng:** ${originalInvoice.customerName || "N/A"}\n`;
    content += `**Chi nhánh:** ${originalInvoice.branchName || "N/A"}\n`;
    content += `**Người lập hóa đơn gốc:** ${
      originalInvoice.soldByName || "N/A"
    }\n`;
    content += `**Người lập hóa đơn điều chỉnh:** ${
      revisedInvoice.soldByName || "N/A"
    }\n\n`;

    content += `**Sự khác biệt:**\n`;

    // Hiển thị thay đổi tổng tiền nếu có
    if (differences.totalChanged) {
      content += `**Thay đổi tổng tiền:** ${differences.oldTotal.toLocaleString(
        "vi-VN"
      )}đ → ${differences.newTotal.toLocaleString("vi-VN")}đ\n\n`;
    }

    // Hiển thị sản phẩm đã thêm vào hóa đơn điều chỉnh
    if (differences.addedProducts && differences.addedProducts.length > 0) {
      content += `**Sản phẩm thêm mới (có trong hóa đơn điều chỉnh nhưng không có trong hóa đơn gốc):**\n`;
      differences.addedProducts.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }

    // Hiển thị sản phẩm đã bị xóa khỏi hóa đơn điều chỉnh
    if (differences.removedProducts && differences.removedProducts.length > 0) {
      content += `**Sản phẩm bị xóa (có trong hóa đơn gốc nhưng không có trong hóa đơn điều chỉnh):**\n`;
      differences.removedProducts.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }

    // Hiển thị sản phẩm thay đổi số lượng
    if (differences.quantityChanges && differences.quantityChanges.length > 0) {
      content += `**Sản phẩm thay đổi số lượng:**\n`;
      differences.quantityChanges.forEach((change, index) => {
        const changeType = change.difference > 0 ? "tăng" : "giảm";
        content += `${index + 1}. ${
          change.product.productName
        } - ${changeType} từ ${change.originalQuantity} thành ${
          change.newQuantity
        }\n`;
      });
      content += `\n`;
    }

    content += `**Tổng tiền hóa đơn gốc:** ${
      originalInvoice.total
        ? originalInvoice.total.toLocaleString("vi-VN")
        : "0"
    }đ\n`;
    content += `**Tổng tiền hóa đơn điều chỉnh:** ${
      revisedInvoice.total ? revisedInvoice.total.toLocaleString("vi-VN") : "0"
    }đ\n\n`;

    content += `**Trạng thái hóa đơn gốc:** ${
      originalInvoice.statusValue || "N/A"
    }\n`;
    content += `**Trạng thái hóa đơn điều chỉnh:** ${
      revisedInvoice.statusValue || "N/A"
    }\n`;

    if (originalInvoice.description) {
      content += `**Ghi chú hóa đơn gốc:** ${
        originalInvoice.description || "Không có"
      }\n`;
    }

    if (revisedInvoice.description) {
      content += `**Ghi chú hóa đơn điều chỉnh:** ${
        revisedInvoice.description || "Không có"
      }\n`;
    }

    content += `**Thời gian so sánh:** ${new Date().toLocaleString("vi-VN")}`;

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "interactive",
      card: {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: "plain_text",
            content: `So sánh Hóa đơn ${originalInvoice.code} và phiên bản ${revisedInvoice.code}`,
          },
          template: "yellow",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content: content,
            },
          },
        ],
      },
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/message/v4/send`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error sending invoice version comparison report:`,
      error.message
    );
    if (error.response) {
      console.error("Response data:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

module.exports = {
  sendReport,
  sendNotification,
  sendTestMessage,
  // sendDetailedOrderReport,
  sendSingleOrderReport,
  sendSingleInvoiceReport,
  sendInvoiceNotificationToAdmin,
  sendInvoiceNotificationToCreator, // Add this line
  getUserOpenId,
  getLarkToken,
  getUserOpenIdByEmail,
  sendOrderInvoiceComparisonReport,
  sendInvoiceVersionComparisonReport,
};
