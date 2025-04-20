// src/lark.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Cấu hình endpoints của Lark API
const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

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
 * Lấy OpenID của người dùng dựa trên email
 * @param {string} email Email của người dùng
 * @returns {Promise<string|null>} OpenID của người dùng hoặc null nếu không tìm thấy
 */
async function getUserOpenIdByEmail(email) {
  if (!email) return null;

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
    console.error(`Lỗi khi lấy OpenID cho ${email}:`, error.message);
    return null;
  }
}

/**
 * Lấy thông tin mapping giữa người dùng KiotViet và Lark
 * @param {string} kiotVietName Tên người dùng trong KiotViet
 * @returns {Object|null} Thông tin mapping hoặc null nếu không tìm thấy
 */
function getUserMappingByKiotVietName(kiotVietName) {
  try {
    const mappingFilePath = path.resolve(process.cwd(), "user-mappings.json");
    if (!fs.existsSync(mappingFilePath)) {
      console.error(`Không tìm thấy file mapping tại: ${mappingFilePath}`);
      return null;
    }

    const data = fs.readFileSync(mappingFilePath, "utf8");
    const mappings = JSON.parse(data);

    return (
      mappings.mappings.find(
        (mapping) => mapping.kiotVietName === kiotVietName
      ) || null
    );
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin mapping người dùng: ${error.message}`);
    return null;
  }
}

/**
 * Gửi thông báo khi phát hiện sự thay đổi trong đơn hàng hoặc hóa đơn
 * @param {Object} invoice Thông tin hóa đơn
 * @returns {Promise<Object|null>} Kết quả gửi thông báo hoặc null nếu có lỗi
 */
async function sendInvoiceNotificationToCreator(invoice) {
  try {
    const token = await getLarkToken();

    const creatorName = invoice.soldByName;
    if (!creatorName) {
      console.error(
        "Không thể gửi thông báo: Không tìm thấy soldByName trong hóa đơn"
      );
      return null;
    }

    const userMapping = getUserMappingByKiotVietName(creatorName);
    if (!userMapping) {
      console.log(
        `Không tìm thấy mapping cho "${creatorName}", bỏ qua thông báo`
      );
      return null;
    }

    const receiverId = userMapping.larkOpenId;
    const displayName = userMapping.displayName;

    console.log(`Gửi thông báo cho: ${displayName} (${receiverId})`);

    // Chuẩn bị nội dung thông báo
    let content = "";
    let titlePrefix = "";
    let templateColor = "blue";

    if (invoice.changeType === "orderDifference" && invoice.orderComparison) {
      // Thông báo về sự khác biệt giữa đơn hàng và hóa đơn
      titlePrefix = "Phát hiện thay đổi: Đơn hàng → Hóa đơn";
      templateColor = "orange";
      content = buildOrderDifferenceContent(invoice);
    } else if (invoice.changeType === "revised") {
      // Hóa đơn được chỉnh sửa
      titlePrefix = `Hóa đơn chỉnh sửa: ${invoice.code}`;
      templateColor = "yellow";
      content = buildRevisedInvoiceContent(invoice);
    } else if (invoice.changeType === "canceled") {
      // Hóa đơn bị hủy
      titlePrefix = `Hóa đơn bị hủy: ${invoice.code}`;
      templateColor = "red";
      content = buildCanceledInvoiceContent(invoice);
    }

    // Thêm thông tin chung
    content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
    content += `**Thời gian thông báo:** ${new Date().toLocaleString("vi-VN")}`;

    try {
      // Gửi tin nhắn trực tiếp cho người dùng
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
              content: titlePrefix,
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
        `Đã gửi thông báo cho ${displayName} về hóa đơn ${invoice.code}`
      );
      return response.data;
    } catch (directMessageError) {
      // Xử lý lỗi khi không thể gửi tin nhắn trực tiếp
      console.error(
        `Lỗi khi gửi tin nhắn trực tiếp cho ${displayName}: ${directMessageError.message}`
      );

      // Kiểm tra nếu lỗi là do không có quyền truy cập
      if (
        directMessageError.response &&
        directMessageError.response.data &&
        (directMessageError.response.data.code === 230013 ||
          (directMessageError.response.data.msg &&
            directMessageError.response.data.msg.includes(
              "Bot has NO availability to this user"
            )))
      ) {
        return await sendFallbackGroupNotification(
          token,
          titlePrefix,
          content,
          displayName,
          templateColor
        );
      }

      // Ghi log lỗi khác
      if (directMessageError.response) {
        console.error(
          "Trạng thái phản hồi:",
          directMessageError.response.status
        );
        console.error(
          "Dữ liệu phản hồi:",
          JSON.stringify(directMessageError.response.data)
        );
      }

      throw directMessageError;
    }
  } catch (error) {
    console.error(
      `Lỗi trong sendInvoiceNotificationToCreator: ${error.message}`
    );
    return null;
  }
}

/**
 * Gửi thông báo dự phòng vào nhóm chat khi không thể gửi trực tiếp cho người dùng
 * @param {string} token Token Lark
 * @param {string} titlePrefix Tiêu đề thông báo
 * @param {string} content Nội dung thông báo
 * @param {string} displayName Tên hiển thị của người dùng
 * @param {string} templateColor Màu của thông báo
 * @returns {Promise<Object>} Kết quả gửi thông báo
 */
async function sendFallbackGroupNotification(
  token,
  titlePrefix,
  content,
  displayName,
  templateColor
) {
  console.log(`Gửi thông báo dự phòng vào nhóm chat cho ${displayName}`);

  const groupData = {
    chat_id: process.env.LARK_CHAT_ID,
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: "plain_text",
          content: `${titlePrefix} (Thông báo cho ${displayName})`,
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
        {
          tag: "hr",
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: `Thông báo này được gửi đến nhóm chat vì không thể gửi trực tiếp đến ${displayName}`,
            },
          ],
        },
      ],
    },
  };

  const groupResponse = await axios.post(
    `${LARK_BASE_URL}/message/v4/send`,
    groupData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`Đã gửi thông báo dự phòng vào nhóm chat cho ${displayName}`);
  return { status: "fallback_sent", data: groupResponse.data };
}

/**
 * Tạo nội dung thông báo khi phát hiện sự khác biệt giữa đơn hàng và hóa đơn
 * @param {Object} invoice Thông tin hóa đơn
 * @returns {string} Nội dung thông báo
 */
function buildOrderDifferenceContent(invoice) {
  const differences = invoice.orderComparison;
  const orderCode = invoice.orderCode || "N/A";
  let content = `**So sánh Đơn hàng và Hóa đơn**\n\n`;
  content += `**Mã đơn hàng:** ${orderCode}\n`;
  content += `**Mã hóa đơn:** ${invoice.code || "N/A"}\n`;
  content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;
  content += `**Chi tiết thay đổi:**\n\n`;

  // Hiển thị sản phẩm mới thêm vào hóa đơn
  if (differences.addedProducts && differences.addedProducts.length > 0) {
    content += `**🆕 Sản phẩm mới được thêm vào:**\n`;
    differences.addedProducts.forEach((item, index) => {
      const productTotal = item.price * item.quantity || 0;
      content += `${index + 1}. ${item.productName} - SL: ${
        item.quantity
      } - Thành tiền: ${productTotal.toLocaleString("vi-VN")}đ\n`;
    });
    content += `\n`;
  }

  // Hiển thị sản phẩm bị xóa khỏi hóa đơn
  if (differences.removedProducts && differences.removedProducts.length > 0) {
    content += `**❌ Sản phẩm bị xóa khỏi hóa đơn:**\n`;
    differences.removedProducts.forEach((item, index) => {
      const productTotal = item.price * item.quantity || 0;
      content += `${index + 1}. ${item.productName} - SL: ${
        item.quantity
      } - Thành tiền: ${productTotal.toLocaleString("vi-VN")}đ\n`;
    });
    content += `\n`;
  }

  // Hiển thị sản phẩm thay đổi số lượng
  if (differences.quantityChanges && differences.quantityChanges.length > 0) {
    content += `**🔄 Sản phẩm thay đổi số lượng:**\n`;
    differences.quantityChanges.forEach((change, index) => {
      const isIncrease = change.difference > 0;
      const changeType = isIncrease ? "tăng" : "giảm";
      const changeAmount = Math.abs(change.difference);
      const productName = change.product.productName;

      content += `${
        index + 1
      }. ${productName} - **${changeType} ${changeAmount}** sản phẩm (từ ${
        change.orderQuantity
      } thành ${change.invoiceQuantity})\n`;
    });
    content += `\n`;
  }

  return content;
}

/**
 * Tạo nội dung thông báo khi hóa đơn được chỉnh sửa
 * @param {Object} invoice Thông tin hóa đơn
 * @returns {string} Nội dung thông báo
 */
function buildRevisedInvoiceContent(invoice) {
  let content = `${invoice.additionalInfo || "Hóa đơn đã được chỉnh sửa"}\n\n`;

  if (invoice.productChanges) {
    // Hiển thị sản phẩm mới thêm vào
    if (
      invoice.productChanges.added &&
      invoice.productChanges.added.length > 0
    ) {
      content += `**🆕 Sản phẩm mới được thêm vào:**\n`;
      invoice.productChanges.added.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }

    // Hiển thị sản phẩm bị xóa
    if (
      invoice.productChanges.removed &&
      invoice.productChanges.removed.length > 0
    ) {
      content += `**❌ Sản phẩm bị xóa:**\n`;
      invoice.productChanges.removed.forEach((item, index) => {
        content += `${index + 1}. ${item.productName} - SL: ${item.quantity}\n`;
      });
      content += `\n`;
    }

    // Hiển thị sản phẩm thay đổi số lượng
    if (
      invoice.productChanges.changed &&
      invoice.productChanges.changed.length > 0
    ) {
      content += `**🔄 Sản phẩm thay đổi số lượng:**\n`;
      invoice.productChanges.changed.forEach((change, index) => {
        const isIncrease = change.difference > 0;
        const changeType = isIncrease ? "tăng" : "giảm";
        const changeAmount = Math.abs(change.difference);

        content += `${index + 1}. ${
          change.product.productName
        } - **${changeType} ${changeAmount}** sản phẩm (từ ${
          change.originalQuantity
        } thành ${change.newQuantity})\n`;
      });
      content += `\n`;
    }

    // Hiển thị thay đổi tổng tiền
    if (invoice.productChanges.totalChanged) {
      content += `**Tổng tiền:** ${invoice.total.toLocaleString(
        "vi-VN"
      )}đ (trước đó: ${invoice.productChanges.oldTotal.toLocaleString(
        "vi-VN"
      )}đ)\n\n`;
    }
  }

  return content;
}

/**
 * Tạo nội dung thông báo khi hóa đơn bị hủy
 * @param {Object} invoice Thông tin hóa đơn
 * @returns {string} Nội dung thông báo
 */
function buildCanceledInvoiceContent(invoice) {
  let content = `**Hóa đơn ${invoice.code} đã bị hủy**\n\n`;
  content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;
  content += `**Tổng tiền:** ${invoice.total.toLocaleString("vi-VN")}đ\n`;
  content += `**Thời gian hủy:** ${new Date().toLocaleString("vi-VN")}\n\n`;

  // Thêm thông tin về đơn hàng gốc nếu có
  if (invoice.orderCode) {
    content += `**Mã đơn hàng gốc:** ${invoice.orderCode}\n`;
  }

  return content;
}

/**
 * Gửi thông báo vào nhóm chat Lark khi có sự so sánh giữa đơn hàng và hóa đơn
 * @param {Object} comparison Thông tin so sánh
 * @returns {Promise<Object>} Kết quả gửi thông báo
 */
async function sendOrderInvoiceComparisonReport(comparison) {
  try {
    const token = await getLarkToken();

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
    content += `**Khách hàng:** ${invoice.customerName || "N/A"}\n`;
    content += `**Chi nhánh:** ${invoice.branchName || "N/A"}\n`;
    content += `**Người lên đơn:** ${invoice.soldByName || "N/A"}\n\n`;

    content += `**Chi tiết thay đổi:**\n\n`;

    // Hiển thị thay đổi tổng tiền nếu có
    const orderTotal = order.total || 0;
    const invoiceTotal = invoice.total || 0;

    if (orderTotal !== invoiceTotal) {
      content += `**Tổng tiền:** ${invoiceTotal.toLocaleString(
        "vi-VN"
      )}đ (đơn hàng gốc: ${orderTotal.toLocaleString("vi-VN")}đ)\n`;

      // Tính phần trăm thay đổi
      if (orderTotal > 0) {
        const percentChange = (
          ((invoiceTotal - orderTotal) / orderTotal) *
          100
        ).toFixed(2);
        const changeDirection = invoiceTotal > orderTotal ? "tăng" : "giảm";
        content += `_Tổng tiền ${changeDirection} ${Math.abs(
          percentChange
        )}%_\n`;
      }

      content += `\n`;
    } else {
      content += `**Tổng tiền:** ${invoiceTotal.toLocaleString("vi-VN")}đ\n\n`;
    }

    // Hiển thị chi tiết thay đổi sản phẩm
    if (differences.addedProducts && differences.addedProducts.length > 0) {
      content += `**🆕 Sản phẩm mới được thêm vào:**\n`;
      differences.addedProducts.forEach((item, index) => {
        const productTotal = item.price * item.quantity || 0;
        content += `${index + 1}. ${item.productName} - SL: ${
          item.quantity
        } - Đơn giá: ${item.price.toLocaleString(
          "vi-VN"
        )}đ - Thành tiền: ${productTotal.toLocaleString("vi-VN")}đ\n`;
      });
      content += `\n`;
    }

    if (differences.removedProducts && differences.removedProducts.length > 0) {
      content += `**❌ Sản phẩm bị xóa khỏi hóa đơn:**\n`;
      differences.removedProducts.forEach((item, index) => {
        const productTotal = item.price * item.quantity || 0;
        content += `${index + 1}. ${item.productName} - SL: ${
          item.quantity
        } - Đơn giá: ${item.price.toLocaleString(
          "vi-VN"
        )}đ - Thành tiền: ${productTotal.toLocaleString("vi-VN")}đ\n`;
      });
      content += `\n`;
    }

    if (differences.quantityChanges && differences.quantityChanges.length > 0) {
      content += `**🔄 Sản phẩm thay đổi số lượng:**\n`;
      differences.quantityChanges.forEach((change, index) => {
        const isIncrease = change.difference > 0;
        const changeType = isIncrease ? "tăng" : "giảm";
        const changeAmount = Math.abs(change.difference);
        const productName = change.product.productName;
        const originalQuantity = change.orderQuantity;
        const newQuantity = change.invoiceQuantity;

        // Tính tiền thay đổi
        const unitPrice = change.product.price || 0;
        const originalTotal = unitPrice * originalQuantity;
        const newTotal = unitPrice * newQuantity;
        const diffTotal = newTotal - originalTotal;

        content += `${
          index + 1
        }. ${productName} - **${changeType} ${changeAmount}** sản phẩm (từ ${originalQuantity} thành ${newQuantity})\n`;
        content += `   Đơn giá: ${unitPrice.toLocaleString(
          "vi-VN"
        )}đ - Thành tiền: ${newTotal.toLocaleString("vi-VN")}đ (${
          diffTotal >= 0 ? "+" : ""
        }${diffTotal.toLocaleString("vi-VN")}đ)\n`;
      });
      content += `\n`;
    }

    content += `**Trạng thái đơn hàng:** ${order.statusValue || "N/A"}\n`;
    content += `**Trạng thái hóa đơn:** ${invoice.statusValue || "N/A"}\n\n`;

    if (order.description && order.description.trim() !== "") {
      content += `**Ghi chú đơn hàng:** ${order.description}\n`;
    }

    if (invoice.description && invoice.description.trim() !== "") {
      content += `**Ghi chú hóa đơn:** ${invoice.description}\n`;
    }

    content += `**Thời gian phát hiện thay đổi:** ${new Date().toLocaleString(
      "vi-VN"
    )}`;

    // Xác định màu sắc card dựa trên mức độ thay đổi
    let templateColor = "orange"; // Màu mặc định
    if (
      differences.addedProducts.length > 0 &&
      differences.removedProducts.length > 0
    ) {
      templateColor = "red"; // Thay đổi lớn: vừa thêm vừa xóa sản phẩm
    } else if (differences.addedProducts.length > 0) {
      templateColor = "green"; // Thêm sản phẩm
    } else if (differences.removedProducts.length > 0) {
      templateColor = "red"; // Xóa sản phẩm
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
            content: `Phát hiện thay đổi: ĐH ${order.code} → HĐ ${invoice.code}`,
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
          {
            tag: "hr",
          },
          {
            tag: "note",
            elements: [
              {
                tag: "plain_text",
                content: `Nguồn đơn hàng: ${
                  differences.orderSource === "draft"
                    ? "Phiếu tạm"
                    : differences.orderSource === "processing"
                    ? "Đơn hàng đã xác nhận"
                    : "Không xác định"
                }`,
              },
            ],
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

    console.log(
      `Đã gửi thông báo so sánh đơn hàng-hóa đơn: ${order.code} - ${invoice.code}`
    );
    return response.data;
  } catch (error) {
    console.error(
      `Lỗi khi gửi báo cáo so sánh đơn hàng-hóa đơn:`,
      error.message
    );
    if (error.response) {
      console.error("Dữ liệu phản hồi:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

/**
 * Gửi thông báo thử nghiệm vào nhóm chat Lark
 * @returns {Promise<Object>} Kết quả gửi thông báo
 */
async function sendTestMessage() {
  try {
    const token = await getLarkToken();

    const data = {
      chat_id: process.env.LARK_CHAT_ID,
      msg_type: "text",
      content: {
        text: "Tin nhắn kiểm tra kết nối từ hệ thống tích hợp KiotViet",
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

    console.log("Phản hồi tin nhắn kiểm tra:", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn kiểm tra:", error.message);
    if (error.response) {
      console.error("Dữ liệu phản hồi:", JSON.stringify(error.response.data));
    }
    throw error;
  }
}

module.exports = {
  getLarkToken,
  getUserOpenIdByEmail,
  sendInvoiceNotificationToCreator,
  sendOrderInvoiceComparisonReport,
  sendTestMessage,
};
