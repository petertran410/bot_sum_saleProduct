// src/invoiceScanner.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const kiotviet = require("./kiotviet");
const lark = require("./lark");

// Định nghĩa đường dẫn file để lưu hóa đơn
const INVOICES_FILE_PATH = path.resolve(process.cwd(), "lastInvoices.json");
// Định nghĩa đường dẫn file để lưu ID hóa đơn đã gửi thông báo
const SENT_INVOICES_FILE_PATH = path.resolve(
  process.cwd(),
  "sentInvoices.json"
);
// Định nghĩa đường dẫn file để lưu trạng thái hóa đơn để phát hiện thay đổi
const INVOICE_STATUS_FILE_PATH = path.resolve(
  process.cwd(),
  "invoiceStatus.json"
);

// Hàm tìm phiên bản hóa đơn gần nhất trước đó
function findPreviousVersionInvoice(invoices, currentCode) {
  // Xác định thông tin phiên bản của hóa đơn hiện tại
  const versionInfo = extractInvoiceVersion(currentCode);

  if (!versionInfo.isRevised || versionInfo.version <= 1) {
    // Nếu là phiên bản đầu tiên (.01) hoặc không phải hóa đơn đã chỉnh sửa, tìm hóa đơn gốc
    return findOriginalInvoice(invoices, versionInfo.baseCode);
  }

  // Tạo mã của phiên bản trước đó
  const previousVersion = versionInfo.version - 1;
  const previousVersionCode = `${versionInfo.baseCode}.${previousVersion
    .toString()
    .padStart(2, "0")}`;

  // Tìm hóa đơn với mã phiên bản trước đó
  const previousInvoice = invoices.find(
    (invoice) => invoice.code === previousVersionCode
  );

  if (previousInvoice) {
    return previousInvoice;
  }

  // Nếu không tìm thấy phiên bản trước đó, quay lại tìm hóa đơn gốc
  return findOriginalInvoice(invoices, versionInfo.baseCode);
}

async function getRecentInvoices() {
  try {
    const token = await kiotviet.getToken();

    // Tính toán ngày trước đó 14 ngày
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 2);

    // Lấy ngày hiện tại
    const currentDate = new Date();

    // Khởi tạo biến
    let allInvoices = [];
    const pageSize = 100;

    console.log(
      `🔍 Bắt đầu lấy hóa đơn từ ${fourteenDaysAgo.toLocaleDateString()} đến ${currentDate.toLocaleDateString()}`
    );

    // Lặp qua từng ngày để đảm bảo lấy đủ dữ liệu
    for (
      let date = new Date(fourteenDaysAgo);
      date <= currentDate;
      date.setDate(date.getDate() + 1)
    ) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();

      console.log(`🔍 Lấy hóa đơn cho ngày ${startDate.toLocaleDateString()}`);

      // Biến cho phân trang trong ngày hiện tại
      let currentItem = 0;
      let hasMoreData = true;
      let dayInvoices = [];

      // Lấy tất cả các trang cho ngày hiện tại
      while (hasMoreData) {
        const response = await axios.get(
          `${process.env.KIOT_BASE_URL}/invoices`,
          {
            params: {
              fromPurchaseDate: startDateStr,
              toPurchaseDate: endDateStr,
              pageSize: pageSize,
              currentItem: currentItem,
              orderBy: "purchaseDate",
              orderDirection: "DESC",
              includePayment: true,
              includeInvoiceDelivery: true,
            },
            headers: {
              Retailer: process.env.KIOT_SHOP_NAME,
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const invoices = response.data.data || [];
        dayInvoices = dayInvoices.concat(invoices);

        console.log(
          `📊 Lấy được ${
            invoices.length
          } hóa đơn cho ${startDate.toLocaleDateString()}, tổng số trong ngày: ${
            dayInvoices.length
          }`
        );

        // Kiểm tra xem có còn dữ liệu cho ngày hiện tại không
        if (invoices.length < pageSize) {
          hasMoreData = false;
        } else {
          currentItem += pageSize;
        }

        // Tránh giới hạn tốc độ API
        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Thêm hóa đơn của ngày vào tổng hợp
      allInvoices = allInvoices.concat(dayInvoices);
      console.log(
        `✅ Hoàn thành lấy hóa đơn cho ${startDate.toLocaleDateString()}, tổng số hóa đơn đến hiện tại: ${
          allInvoices.length
        }`
      );

      // Đợi một chút trước khi chuyển sang ngày tiếp theo để tránh giới hạn tốc độ API
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Loại bỏ trùng lặp
    const uniqueInvoices = [];
    const invoiceIdSet = new Set();

    for (const invoice of allInvoices) {
      if (invoice && invoice.id && !invoiceIdSet.has(invoice.id)) {
        invoiceIdSet.add(invoice.id);
        uniqueInvoices.push(invoice);
      }
    }

    console.log(
      `🔄 Đã loại bỏ ${
        allInvoices.length - uniqueInvoices.length
      } hóa đơn trùng lặp`
    );
    console.log(`✅ Tổng số hóa đơn duy nhất: ${uniqueInvoices.length}`);

    return uniqueInvoices;
  } catch (error) {
    console.error("❌ Lỗi khi lấy hóa đơn gần đây:", error.message);
    throw error;
  }
}

async function setupInvoiceScanner() {
  console.log("Setting up periodic scanner for invoices every 15 seconds");

  const interval = setInterval(async () => {
    try {
      console.log(
        `\n--- Scanning invoices at ${new Date().toLocaleTimeString()} ---`
      );

      // Lấy danh sách hóa đơn hiện tại
      const currentInvoices = await getRecentInvoices();
      console.log(`Retrieved ${currentInvoices.length} invoices from KiotViet`);

      // Lấy trạng thái hóa đơn đã lưu trước đó
      const savedInvoiceStatus = getSavedInvoiceStatus();

      // Tìm các hóa đơn bị hủy
      const canceledInvoices = findCanceledInvoices(
        currentInvoices,
        savedInvoiceStatus
      );
      // For canceled invoices
      if (canceledInvoices.length > 0) {
        console.log(`Found ${canceledInvoices.length} canceled invoices`);

        for (const invoice of canceledInvoices) {
          try {
            const orderComparison = await compareInvoiceWithOrder(invoice);

            // Send to group chat
            await lark.sendSingleInvoiceReport({
              ...invoice,
              changeType: "canceled",
              orderComparison,
            });

            // Send direct message to creator
            await lark.sendInvoiceNotificationToCreator({
              ...invoice,
              changeType: "canceled",
              orderComparison,
            });

            console.log(
              `Successfully sent notifications for canceled invoice ${invoice.code}`
            );
          } catch (err) {
            console.error(
              `Error sending notification for canceled invoice ${invoice.code}:`,
              err.message
            );
          }
        }
      } else {
        console.log("No canceled invoices found");
      }

      // Lọc các hóa đơn có định dạng mã ".0x" (đã bị hủy và tạo lại)
      const revisedInvoices = filterRevisedInvoices(currentInvoices);
      console.log(
        `Found ${revisedInvoices.length} revised invoices (.0x format)`
      );

      // Lấy danh sách ID hóa đơn đã gửi thông báo
      const sentInvoicesData = getSentInvoicesData();

      // Xác định các hóa đơn đã chỉnh sửa mới cần gửi thông báo
      const newRevisedInvoices = filterNewInvoices(
        revisedInvoices,
        sentInvoicesData
      );

      if (newRevisedInvoices.length > 0) {
        console.log(
          `Found ${newRevisedInvoices.length} new revised invoices to send notifications`
        );

        // Gửi thông báo cho các hóa đơn đã chỉnh sửa
        for (const invoice of newRevisedInvoices) {
          try {
            // Xác định phiên bản của hóa đơn (số .0x)
            const versionInfo = extractInvoiceVersion(invoice.code);
            const orderComparison = await compareInvoiceWithOrder(invoice);

            if (versionInfo.isRevised) {
              // Tìm phiên bản hóa đơn trước đó để so sánh
              const previousInvoice = findPreviousVersionInvoice(
                currentInvoices,
                invoice.code
              );

              if (previousInvoice) {
                // So sánh chi tiết sản phẩm giữa phiên bản trước và phiên bản hiện tại
                const productChanges = compareInvoiceDetails(
                  previousInvoice,
                  invoice
                );

                // Tạo thông tin bổ sung
                let versionDescription = "";
                if (versionInfo.version === 1) {
                  versionDescription = `Hóa đơn được chỉnh sửa lần đầu`;
                } else {
                  versionDescription = `Hóa đơn được chỉnh sửa từ phiên bản .${(
                    versionInfo.version - 1
                  )
                    .toString()
                    .padStart(2, "0")} thành phiên bản .${versionInfo.version
                    .toString()
                    .padStart(2, "0")}`;
                }

                // Gửi thông báo đến nhóm chat chung với thông tin về sự thay đổi
                await lark.sendSingleInvoiceReport({
                  ...invoice,
                  changeType: "revised",
                  additionalInfo: versionDescription,
                  productChanges: productChanges,
                  previousVersionCode: previousInvoice.code,
                  orderComparison,
                });

                console.log(
                  `Successfully sent notification for revised invoice ${invoice.code}`
                );

                // Gửi thông báo trực tiếp đến người lập
                await lark.sendInvoiceNotificationToCreator({
                  ...invoice,
                  changeType: "revised",
                  additionalInfo: versionDescription,
                  productChanges: productChanges,
                  previousVersionCode: previousInvoice.code,
                  orderComparison,
                });
              } else {
                console.log(
                  `Could not find previous version for ${invoice.code}, sending without comparison`
                );
                await lark.sendSingleInvoiceReport({
                  ...invoice,
                  changeType: "revised",
                  additionalInfo: `Hóa đơn đã được chỉnh sửa lần thứ ${versionInfo.version}`,
                  orderComparison,
                });

                // Gửi thông báo trực tiếp đến người lập
                await lark.sendInvoiceNotificationToCreator({
                  ...invoice,
                  changeType: "revised",
                  additionalInfo: `Hóa đơn đã được chỉnh sửa lần thứ ${versionInfo.version}`,
                  orderComparison,
                });
              }
            }

            // Thêm ID hóa đơn vào danh sách đã gửi
            sentInvoicesData.invoiceIds.push({
              id: invoice.id,
              code: invoice.code,
              sentAt: new Date().toISOString(),
            });
          } catch (err) {
            console.error(
              `Error sending notification for invoice ${invoice.code}:`,
              err.message
            );
          }
        }

        // Lưu danh sách ID hóa đơn đã gửi
        saveSentInvoicesData(sentInvoicesData);
      } else {
        console.log("No new revised invoices to send notifications");
      }

      // Lưu danh sách hóa đơn hiện tại vào file
      saveCurrentInvoices(currentInvoices);

      // Cập nhật trạng thái hóa đơn
      saveInvoiceStatus(currentInvoices);
    } catch (error) {
      console.error("Error in invoice scanner:", error.message);
    }
  }, 15000); // Chạy mỗi 15 giây

  return {
    stop: () => clearInterval(interval),
  };
}

function findCanceledInvoices(currentInvoices, savedInvoiceStatus) {
  const canceledInvoices = [];

  // Đi qua tất cả các hóa đơn hiện tại
  for (const invoice of currentInvoices) {
    // Chỉ xét những hóa đơn có trạng thái "Đã hủy" (status = 2)
    if (invoice.status === 2) {
      // Kiểm tra xem hóa đơn đã tồn tại trong savedInvoiceStatus chưa
      const savedInvoice = savedInvoiceStatus[invoice.code];

      // Nếu hóa đơn đã tồn tại và trạng thái trước đó khác "Đã hủy"
      if (savedInvoice && savedInvoice.status !== 2) {
        canceledInvoices.push(invoice);
      }
    }
  }

  return canceledInvoices;
}

// Hàm lấy trạng thái hóa đơn đã lưu
function getSavedInvoiceStatus() {
  try {
    if (fs.existsSync(INVOICE_STATUS_FILE_PATH)) {
      const data = fs.readFileSync(INVOICE_STATUS_FILE_PATH, "utf8");
      if (!data || data.trim() === "") {
        return {};
      }

      try {
        const parsedData = JSON.parse(data);
        return parsedData;
      } catch (parseError) {
        console.error("Error parsing invoice status data:", parseError.message);
        return {};
      }
    }
    console.log("No existing invoice status data file, creating new one");
    return {};
  } catch (error) {
    console.error("Error reading invoice status data:", error.message);
    return {};
  }
}

// Hàm tìm hóa đơn gốc dựa trên mã cơ sở
function findOriginalInvoice(invoices, baseCode) {
  return invoices.find((invoice) => invoice.code === baseCode);
}

// Hàm so sánh chi tiết sản phẩm giữa hóa đơn gốc và hóa đơn đã chỉnh sửa
function compareInvoiceDetails(originalInvoice, revisedInvoice) {
  const comparison = {
    added: [],
    removed: [],
    changed: [],
    totalChanged: false,
    oldTotal: null,
    newTotal: null,
  };

  // Kiểm tra thay đổi tổng tiền
  if (originalInvoice.total !== revisedInvoice.total) {
    comparison.totalChanged = true;
    comparison.oldTotal = originalInvoice.total;
    comparison.newTotal = revisedInvoice.total;
  }

  if (!originalInvoice.invoiceDetails || !revisedInvoice.invoiceDetails) {
    return comparison;
  }

  // Tạo map từ chi tiết sản phẩm của hóa đơn gốc để tra cứu nhanh
  const originalDetailsMap = new Map();
  originalInvoice.invoiceDetails.forEach((detail) => {
    if (detail.productId) {
      originalDetailsMap.set(detail.productId, detail);
    }
  });

  // Tạo map từ chi tiết sản phẩm của hóa đơn đã chỉnh sửa để tra cứu nhanh
  const revisedDetailsMap = new Map();
  revisedInvoice.invoiceDetails.forEach((detail) => {
    if (detail.productId) {
      revisedDetailsMap.set(detail.productId, detail);
    }
  });

  // Sản phẩm đã được thêm vào
  comparison.added = revisedInvoice.invoiceDetails.filter(
    (detail) => !originalDetailsMap.has(detail.productId)
  );

  // Sản phẩm đã bị xóa
  comparison.removed = originalInvoice.invoiceDetails.filter(
    (detail) => !revisedDetailsMap.has(detail.productId)
  );

  // Sản phẩm có thay đổi số lượng
  revisedInvoice.invoiceDetails.forEach((revisedDetail) => {
    if (originalDetailsMap.has(revisedDetail.productId)) {
      const originalDetail = originalDetailsMap.get(revisedDetail.productId);
      if (revisedDetail.quantity !== originalDetail.quantity) {
        comparison.changed.push({
          product: revisedDetail,
          originalQuantity: originalDetail.quantity,
          newQuantity: revisedDetail.quantity,
          difference: revisedDetail.quantity - originalDetail.quantity,
        });
      }
    }
  });

  return comparison;
}

// Hàm lưu trạng thái hóa đơn
function saveInvoiceStatus(invoices) {
  try {
    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(INVOICE_STATUS_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Tạo đối tượng lưu trạng thái
    const statusData = {};
    invoices.forEach((invoice) => {
      if (invoice.code) {
        statusData[invoice.code] = {
          id: invoice.id,
          status: invoice.status,
          modifiedDate: invoice.modifiedDate,
        };
      }
    });

    // Ghi file
    fs.writeFileSync(
      INVOICE_STATUS_FILE_PATH,
      JSON.stringify(statusData, null, 2),
      "utf8"
    );

    console.log(
      `Successfully saved status for ${Object.keys(statusData).length} invoices`
    );
  } catch (error) {
    console.error("Error saving invoice status data:", error.message);
  }
}

// Hàm lọc các hóa đơn có mã dạng .0x (đã bị hủy và tạo lại)
function filterRevisedInvoices(invoices) {
  // Tìm tất cả các hóa đơn có mã dạng .0x
  const revisedInvoices = invoices.filter((invoice) => {
    if (!invoice.code) return false;

    // Kiểm tra mẫu .01, .02, ... ở cuối mã hóa đơn
    const regex = /\.\d+$/;
    return regex.test(invoice.code);
  });

  return revisedInvoices;
}

// Hàm trích xuất thông tin phiên bản hóa đơn - cập nhật để xử lý định dạng .0x đúng hơn
function extractInvoiceVersion(invoiceCode) {
  if (!invoiceCode) {
    return { isRevised: false, baseCode: invoiceCode, version: 0 };
  }

  // Kiểm tra mẫu .01, .02, ... ở cuối mã hóa đơn
  const regex = /^(.+)\.(\d+)$/;
  const match = invoiceCode.match(regex);

  if (match) {
    return {
      isRevised: true,
      baseCode: match[1], // Mã gốc không có .0x
      version: parseInt(match[2]), // Phiên bản (1, 2, ...)
    };
  } else {
    return { isRevised: false, baseCode: invoiceCode, version: 0 };
  }
}

// Hàm lọc các hóa đơn mới chưa gửi thông báo
function filterNewInvoices(currentInvoices, sentInvoicesData) {
  if (
    !sentInvoicesData ||
    !sentInvoicesData.invoiceIds ||
    !Array.isArray(sentInvoicesData.invoiceIds)
  ) {
    return currentInvoices;
  }

  const sentInvoiceIdSet = new Set(
    sentInvoicesData.invoiceIds.map((item) => item.id)
  );

  return currentInvoices.filter((invoice) => !sentInvoiceIdSet.has(invoice.id));
}

// Hàm lấy dữ liệu về các hóa đơn đã gửi thông báo
function getSentInvoicesData() {
  try {
    if (fs.existsSync(SENT_INVOICES_FILE_PATH)) {
      const data = fs.readFileSync(SENT_INVOICES_FILE_PATH, "utf8");
      if (!data || data.trim() === "") {
        return { invoiceIds: [] };
      }

      try {
        const parsedData = JSON.parse(data);

        if (!parsedData.invoiceIds || !Array.isArray(parsedData.invoiceIds)) {
          return { invoiceIds: [] };
        }
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

        parsedData.invoiceIds = parsedData.invoiceIds.filter((item) => {
          if (!item.sentAt) return true;
          return new Date(item.sentAt) >= thirtyDaysAgo;
        });

        console.log(
          `Loaded ${parsedData.invoiceIds.length} sent invoice IDs from file`
        );
        return parsedData;
      } catch (parseError) {
        console.error("Error parsing sent invoices data:", parseError.message);
        return { invoiceIds: [] };
      }
    }
    console.log("No existing sent invoices data file, creating new one");
    return { invoiceIds: [] };
  } catch (error) {
    console.error("Error reading sent invoices data:", error.message);
    return { invoiceIds: [] };
  }
}

// Hàm lưu dữ liệu về các hóa đơn đã gửi thông báo
function saveSentInvoicesData(data) {
  try {
    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(SENT_INVOICES_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Ghi file
    fs.writeFileSync(
      SENT_INVOICES_FILE_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    console.log(
      `Successfully saved sent invoices data with ${data.invoiceIds.length} items`
    );
  } catch (error) {
    console.error("Error saving sent invoices data:", error.message);
  }
}

function saveCurrentInvoices(invoices) {
  try {
    if (!invoices || !Array.isArray(invoices)) {
      console.error("Invalid invoices data");
      return;
    }

    // Loại bỏ trùng lặp dựa trên ID hoặc code của hóa đơn
    const uniqueInvoices = [];
    const invoiceIdSet = new Set();

    for (const invoice of invoices) {
      if (invoice && invoice.id && !invoiceIdSet.has(invoice.id)) {
        invoiceIdSet.add(invoice.id);
        uniqueInvoices.push(invoice);
      }
    }

    console.log(
      `Removed ${invoices.length - uniqueInvoices.length} duplicate invoices`
    );
    console.log(
      `Saving ${uniqueInvoices.length} unique invoices to ${INVOICES_FILE_PATH}`
    );

    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(INVOICES_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Thêm timestamp khi lưu
    const dataToSave = {
      timestamp: new Date().toISOString(),
      invoices: uniqueInvoices,
    };

    // Ghi file
    fs.writeFileSync(
      INVOICES_FILE_PATH,
      JSON.stringify(dataToSave, null, 2),
      "utf8"
    );
    console.log(`Successfully saved ${uniqueInvoices.length} unique invoices`);
  } catch (error) {
    console.error("Error saving current invoices data:", error.message);
  }
}

// Hàm để lấy thông tin đơn đặt hàng dựa vào orderCode
async function getOrderByCode(orderCode) {
  try {
    const token = await kiotviet.getToken();

    const response = await axios.get(
      `${process.env.KIOT_BASE_URL}/orders/code/${orderCode}`,
      {
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Error getting order by code ${orderCode}:`, error.message);
    return null;
  }
}

// Hàm so sánh hóa đơn với đơn đặt hàng
async function compareInvoiceWithOrder(invoice) {
  try {
    // Skip if no order code is associated with the invoice
    if (!invoice.orderCode) {
      return null;
    }

    // Get the original order
    const order = await getOrderByCode(invoice.orderCode);
    if (!order || !order.orderDetails) {
      return null;
    }

    // Create maps for easy comparison
    const orderDetailsMap = new Map();
    order.orderDetails.forEach((detail) => {
      if (detail.productId) {
        orderDetailsMap.set(detail.productId, detail);
      }
    });

    const invoiceDetailsMap = new Map();
    if (invoice.invoiceDetails) {
      invoice.invoiceDetails.forEach((detail) => {
        if (detail.productId) {
          invoiceDetailsMap.set(detail.productId, detail);
        }
      });
    }

    // Find differences
    const comparison = {
      addedProducts: [], // Products in invoice but not in order
      removedProducts: [], // Products in order but not in invoice
      quantityChanges: [], // Products with changed quantities
      hasChanges: false,
    };

    // Added products
    for (const [productId, invoiceDetail] of invoiceDetailsMap) {
      if (!orderDetailsMap.has(productId)) {
        comparison.addedProducts.push(invoiceDetail);
        comparison.hasChanges = true;
      }
    }

    // Removed products
    for (const [productId, orderDetail] of orderDetailsMap) {
      if (!invoiceDetailsMap.has(productId)) {
        comparison.removedProducts.push(orderDetail);
        comparison.hasChanges = true;
      }
    }

    // Changed quantities
    for (const [productId, invoiceDetail] of invoiceDetailsMap) {
      if (orderDetailsMap.has(productId)) {
        const orderDetail = orderDetailsMap.get(productId);
        if (invoiceDetail.quantity !== orderDetail.quantity) {
          comparison.quantityChanges.push({
            product: invoiceDetail,
            orderQuantity: orderDetail.quantity,
            invoiceQuantity: invoiceDetail.quantity,
            difference: invoiceDetail.quantity - orderDetail.quantity,
          });
          comparison.hasChanges = true;
        }
      }
    }

    return comparison.hasChanges ? comparison : null;
  } catch (error) {
    console.error("Error comparing invoice with order:", error.message);
    return null;
  }
}

module.exports = {
  setupInvoiceScanner,
  getRecentInvoices,
};
