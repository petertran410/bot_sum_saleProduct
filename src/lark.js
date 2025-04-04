// src/lark.js
const axios = require("axios");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN = process.env.LARK_USER_TOKEN;

async function sendReport(changedOrders) {
  try {
    const token = LARK_TOKEN;
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

// async function sendDetailedOrderReport(order) {
//   try {
//     const cardContent = {
//       config: {
//         wide_screen_mode: true,
//       },
//       header: {
//         title: {
//           tag: "plain_text",
//           content: `Chi tiết đơn hàng: ${order.code}`,
//         },
//         template: "green",
//       },
//       elements: [
//         {
//           tag: "div",
//           text: {
//             tag: "lark_md",
//             content: `**Mã đơn:** ${order.code}\n**Khách hàng:** ${order.customerName}\n**Chi nhánh:** ${order.branchName}\n**Trạng thái:** ${order.statusValue}`,
//           },
//         },
//         {
//           tag: "hr",
//         },
//         {
//           tag: "div",
//           text: {
//             tag: "lark_md",
//             content: "**Chi tiết sản phẩm:**",
//           },
//         },
//       ],
//     };

//     if (order.orderDetails && order.orderDetails.length > 0) {
//       cardContent.elements.push({
//         tag: "table",
//         columns: [
//           { width: 200, weight: 3 },
//           { width: 50, weight: 1 },
//           { width: 100, weight: 1 },
//           { width: 120, weight: 1 },
//         ],
//         data: [
//           [
//             { tag: "plain_text", content: "Sản phẩm" },
//             { tag: "plain_text", content: "SL" },
//             { tag: "plain_text", content: "Đơn giá" },
//             { tag: "plain_text", content: "Thành tiền" },
//           ],
//           ...order.orderDetails.map((item) => [
//             { tag: "plain_text", content: item.productName || "N/A" },
//             { tag: "plain_text", content: item.quantity.toString() },
//             {
//               tag: "plain_text",
//               content: item.price
//                 ? `${item.price.toLocaleString("vi-VN")}`
//                 : "N/A",
//             },
//             {
//               tag: "plain_text",
//               content:
//                 item.price * item.quantity
//                   ? `${(item.price * item.quantity).toLocaleString("vi-VN")}`
//                   : "N/A",
//             },
//           ]),
//         ],
//       });
//     }

//     cardContent.elements.push({
//       tag: "hr",
//     });

//     cardContent.elements.push({
//       tag: "div",
//       text: {
//         tag: "lark_md",
//         content: `**Tổng tiền:** ${
//           order.total ? order.total.toLocaleString("vi-VN") : "0"
//         } VNĐ\n**Đã thanh toán:** ${
//           order.totalPayment ? order.totalPayment.toLocaleString("vi-VN") : "0"
//         } VNĐ\n**Còn lại:** ${
//           order.total - order.totalPayment
//             ? (order.total - order.totalPayment).toLocaleString("vi-VN")
//             : "0"
//         } VNĐ`,
//       },
//     });

//     if (order.description) {
//       cardContent.elements.push({
//         tag: "div",
//         text: {
//           tag: "lark_md",
//           content: `**Ghi chú:** ${order.description}`,
//         },
//       });
//     }

//     const data = {
//       chat_id: process.env.LARK_CHAT_ID,
//       msg_type: "interactive",
//       card: cardContent,
//     };

//     const response = await axios.post(
//       `${LARK_BASE_URL}/message/v4/send`,
//       data,
//       {
//         headers: {
//           Authorization: `Bearer ${LARK_TOKEN}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     return response.data;
//   } catch (error) {
//     console.error(
//       "Error sending detailed order report to Lark:",
//       error.message
//     );
//     throw error;
//   }
// }

async function sendNotification(order) {
  try {
    const token = LARK_TOKEN;

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
          Authorization: `Bearer ${LARK_TOKEN}`,
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
    const token = LARK_TOKEN;
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

module.exports = {
  sendReport,
  sendNotification,
  sendTestMessage,
  // sendDetailedOrderReport,
  sendSingleOrderReport,
};
