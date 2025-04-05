// src/lark.js
const axios = require("axios");

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

// async function sendSingleInvoiceReport(invoice) {
//   try {
//     const token = await getLarkToken();
//     const changeType =
//       invoice.changeType === "new" ? "🆕 HÓA ĐƠN MỚI" : "🔄 HÓA ĐƠN CẬP NHẬT";

//     let content = `**${changeType}**\n\n`;
//     content += `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;
//     content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
//     content += `**Người lập:** ${invoice.soldByName || "N/A"}\n`;
//     content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;

//     if (invoice.orderCode) {
//       content += `**Mã đơn hàng:** ${invoice.orderCode}\n`;
//     }

//     content += `**Tổng tiền:** ${
//       invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"
//     } đ\n\n`;

//     if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
//       content += `**Sản phẩm:**\n`;
//       invoice.invoiceDetails.forEach((item, index) => {
//         content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
//       });
//       content += "\n";
//     }

//     content += `**Trạng thái:** ${invoice.statusValue || "N/A"}\n`;

//     if (invoice.description && invoice.description.trim() !== "") {
//       content += `**Ghi chú:** ${invoice.description}\n`;
//     }

//     const data = {
//       chat_id: process.env.LARK_CHAT_ID,
//       msg_type: "interactive",
//       card: {
//         config: {
//           wide_screen_mode: true,
//         },
//         header: {
//           title: {
//             tag: "plain_text",
//             content: `${changeType} - ${invoice.code}`,
//           },
//           template: invoice.changeType === "new" ? "green" : "orange",
//         },
//         elements: [
//           {
//             tag: "div",
//             text: {
//               tag: "lark_md",
//               content: content,
//             },
//           },
//         ],
//       },
//     };

//     const response = await axios.post(
//       `https://open.larksuite.com/open-apis/message/v4/send`,
//       data,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     return response.data;
//   } catch (error) {
//     console.error(
//       `Error sending invoice notification for ${invoice.code}:`,
//       error.message
//     );
//     if (error.response) {
//       console.error("Response data:", JSON.stringify(error.response.data));
//     }
//     throw error;
//   }
// }

async function sendSingleInvoiceReport(invoice) {
  try {
    const token = await getLarkToken();

    // Đơn giản hóa nội dung thông báo vì sẽ gửi rất nhiều
    let content = `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;
    content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
    content += `**Người lập:** ${invoice.soldByName || "N/A"}\n`;
    content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;

    if (invoice.orderCode) {
      content += `**Mã đơn hàng:** ${invoice.orderCode}\n`;
    }

    content += `**Tổng tiền:** ${
      invoice.total ? invoice.total.toLocaleString("vi-VN") : "0"
    } đ\n\n`;

    if (invoice.invoiceDetails && invoice.invoiceDetails.length > 0) {
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

    // Chọn màu dựa trên trạng thái hóa đơn
    let template = "blue"; // Mặc định
    if (invoice.status === 1) template = "green"; // Hoàn thành
    else if (invoice.status === 2) template = "red"; // Đã hủy
    else if (invoice.status === 3) template = "yellow"; // Đang xử lý

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
            content: `Hóa đơn: ${invoice.code}`,
          },
          template: template,
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

module.exports = {
  sendReport,
  sendNotification,
  sendTestMessage,
  // sendDetailedOrderReport,
  sendSingleOrderReport,
  sendSingleInvoiceReport,
};
