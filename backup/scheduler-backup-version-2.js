// Tối ưu file scheduler.js
const axios = require("axios");
const schedule = require("node-schedule");
const kiotviet = require("./kiotviet");
const invoiceScanner = require("./invoiceScanner");
const lark = require("./lark");
const path = require("path");
const fs = require("fs");

// Đường dẫn đến thư mục lưu trữ dữ liệu đơn hàng theo ngày
const DATA_DIR = path.resolve(process.cwd(), "data");
// Đường dẫn đến file lưu trữ thông tin tổng hợp
const ORDERS_SUMMARY_FILE = path.resolve(DATA_DIR, "orders_summary.json");
// Đường dẫn đến file lưu trữ danh sách đơn hàng (vẫn giữ để tương thích ngược)
const ORDERS_FILE_PATH = path.resolve(process.cwd(), "lastOrders.json");
exports.ORDERS_FILE_PATH = ORDERS_FILE_PATH;

function setupPeriodicCheck() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📂 Đã tạo thư mục dữ liệu: ${DATA_DIR}`);
  }

  setTimeout(async () => {
    try {
      console.log("🔄 Chạy kiểm tra ban đầu...");
      await runReportNow();
    } catch (error) {
      console.error("❌ Lỗi trong quá trình kiểm tra ban đầu:", error.message);
    }
  }, 5000);

  const interval = setInterval(async () => {
    try {
      console.log(
        `\n--- 🕒 Kiểm tra định kỳ lúc ${new Date().toLocaleTimeString()} ---`
      );

      // Lấy và lưu đơn hàng trong 14 ngày
      await fetchAndStoreOrdersForLast14Days();

      // Lấy danh sách hóa đơn hiện tại
      const currentInvoices = await invoiceScanner.getRecentInvoices();
      console.log(`📊 Đã lấy ${currentInvoices.length} hóa đơn từ KiotViet`);

      // Lấy tất cả các đơn hàng đã lưu
      const allSavedOrders = await getAllSavedOrders();
      console.log(
        `📊 Đã tải ${allSavedOrders.length} đơn hàng đã lưu để so sánh`
      );

      // Lọc các đơn hàng ở trạng thái hợp lệ
      const validOrders = allSavedOrders.filter(
        (order) =>
          order.status === 1 || order.status === 2 || order.status === 3
      );
      console.log(
        `🔍 Đã lọc ${validOrders.length} đơn hàng với trạng thái hợp lệ từ dữ liệu đã lưu`
      );

      // So sánh đơn hàng với hóa đơn
      const orderInvoiceComparisons = compareOrdersWithInvoices(
        validOrders,
        currentInvoices
      );

      // Gửi thông báo cho các so sánh có sự khác biệt
      if (orderInvoiceComparisons.length > 0) {
        console.log(
          `🔔 Tìm thấy ${orderInvoiceComparisons.length} đơn hàng có sự khác biệt so với hóa đơn`
        );

        for (const comparison of orderInvoiceComparisons) {
          try {
            await lark.sendOrderInvoiceComparisonReport(comparison);
            console.log(
              `✅ Đã gửi báo cáo so sánh cho đơn hàng ${comparison.order.code} và hóa đơn ${comparison.invoice.code}`
            );
          } catch (err) {
            console.error(
              `❌ Lỗi gửi báo cáo so sánh cho đơn hàng ${comparison.order.code}:`,
              err.message
            );
          }
        }
      } else {
        console.log("✅ Không tìm thấy sự khác biệt giữa đơn hàng và hóa đơn");
      }

      // So sánh hóa đơn gốc với các phiên bản điều chỉnh
      const invoiceVersionComparisons = compareInvoiceVersions(currentInvoices);

      // Gửi thông báo cho các so sánh có sự khác biệt
      if (invoiceVersionComparisons.length > 0) {
        console.log(
          `🔔 Tìm thấy ${invoiceVersionComparisons.length} hóa đơn điều chỉnh có sự khác biệt`
        );

        for (const comparison of invoiceVersionComparisons) {
          try {
            await lark.sendInvoiceVersionComparisonReport(comparison);
            console.log(
              `✅ Đã gửi báo cáo so sánh cho hóa đơn ${comparison.originalInvoice.code} và phiên bản điều chỉnh ${comparison.revisedInvoice.code}`
            );
          } catch (err) {
            console.error(
              `❌ Lỗi gửi báo cáo so sánh cho hóa đơn ${comparison.originalInvoice.code}:`,
              err.message
            );
          }
        }
      } else {
        console.log(
          "✅ Không tìm thấy sự khác biệt giữa các phiên bản hóa đơn"
        );
      }

      // Cập nhật file lastOrders.json để tương thích ngược
      saveCurrentData(validOrders);
    } catch (error) {
      console.error("❌ Lỗi trong quá trình kiểm tra định kỳ:", error.message);
    }
  }, 15000);

  return {
    stop: () => clearInterval(interval),
  };
}

/**
 * Lấy và lưu đơn hàng cho 14 ngày gần nhất
 */
async function fetchAndStoreOrdersForLast14Days() {
  try {
    console.log("🔄 Bắt đầu tải và lưu đơn hàng trong 14 ngày gần đây");

    // Tạo danh sách 14 ngày gần nhất
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date);
    }

    // Tải thông tin tóm tắt từ file nếu có
    let summary = {
      lastProcessedDays: {},
      lastUpdate: new Date().toISOString(),
    };
    if (fs.existsSync(ORDERS_SUMMARY_FILE)) {
      try {
        const data = fs.readFileSync(ORDERS_SUMMARY_FILE, "utf8");
        summary = JSON.parse(data);
      } catch (err) {
        console.error(`❌ Lỗi đọc file tổng hợp: ${err.message}`);
      }
    }

    let allOrdersCount = 0;

    // Duyệt qua từng ngày
    for (const day of days) {
      const dateStr = day.toISOString().split("T")[0]; // Định dạng YYYY-MM-DD
      const filePath = path.resolve(DATA_DIR, `orders_${dateStr}.json`);

      // Kiểm tra xem ngày này đã được xử lý đầy đủ chưa
      const dayKey = day.toISOString().split("T")[0];
      const dayProcessed = summary.lastProcessedDays[dayKey];

      // Nếu ngày này đã được xử lý đầy đủ và file tồn tại, bỏ qua
      if (dayProcessed && fs.existsSync(filePath)) {
        console.log(`📅 Ngày ${dateStr} đã được xử lý đầy đủ, bỏ qua`);
        allOrdersCount += dayProcessed.count || 0;
        continue;
      }

      console.log(`🔍 Đang xử lý đơn hàng cho ngày: ${dateStr}`);

      // Lấy đơn hàng cho ngày này
      const orders = await getOrdersForDay(day);
      console.log(`📊 Đã lấy ${orders.length} đơn hàng cho ${dateStr}`);

      if (orders.length > 0) {
        // Đảm bảo thư mục tồn tại
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // Lọc đơn hàng ở trạng thái phù hợp
        const validOrders = orders.filter(
          (order) =>
            order.status === 1 || order.status === 2 || order.status === 3
        );

        console.log(
          `📝 Lưu ${validOrders.length} đơn hàng hợp lệ cho ${dateStr}`
        );

        // Lưu vào file cho ngày cụ thể
        fs.writeFileSync(
          filePath,
          JSON.stringify(validOrders, null, 2),
          "utf8"
        );

        // Cập nhật thông tin tóm tắt
        summary.lastProcessedDays[dayKey] = {
          processed: true,
          count: validOrders.length,
          validCount: validOrders.length,
          originalCount: orders.length,
          lastUpdate: new Date().toISOString(),
        };

        allOrdersCount += validOrders.length;
      } else {
        console.log(`ℹ️ Không tìm thấy đơn hàng cho ${dateStr}`);
        // Đánh dấu đã xử lý nhưng không có dữ liệu
        summary.lastProcessedDays[dayKey] = {
          processed: true,
          count: 0,
          validCount: 0,
          originalCount: 0,
          lastUpdate: new Date().toISOString(),
        };
      }

      // Lưu thông tin tóm tắt
      summary.lastUpdate = new Date().toISOString();
      fs.writeFileSync(
        ORDERS_SUMMARY_FILE,
        JSON.stringify(summary, null, 2),
        "utf8"
      );

      // Tránh giới hạn tốc độ API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      `✅ Hoàn thành việc tải và lưu đơn hàng, tổng cộng ${allOrdersCount} đơn hàng hợp lệ trong 14 ngày`
    );

    // Cập nhật file lastOrders.json
    const allSavedOrders = await getAllSavedOrders();
    saveCurrentData(allSavedOrders);
  } catch (error) {
    console.error("❌ Lỗi tải và lưu đơn hàng trong 14 ngày:", error.message);
    throw error;
  }
}

/**
 * Lấy đơn hàng cho một ngày cụ thể
 */
async function getOrdersForDay(date) {
  try {
    const token = await kiotviet.getToken();

    // Tính toán 7 ngày trước
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Định dạng ngày
    const fromDateStr = sevenDaysAgo.toISOString();
    const toDateStr = new Date().toISOString();

    console.log(`🔍 Lấy đơn hàng từ ${fromDateStr} đến ${toDateStr}`);

    // Biến phân trang
    let currentItem = 0;
    let hasMoreData = true;
    let allOrders = [];
    const pageSize = 100;

    // Lấy tất cả đơn hàng
    while (hasMoreData) {
      const response = await axios.get(`${process.env.KIOT_BASE_URL}/orders`, {
        params: {
          fromCreatedDate: fromDateStr,
          toCreatedDate: toDateStr,
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
          includeOrderDelivery: true,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      const orders = response.data.data || [];
      allOrders = allOrders.concat(orders);

      console.log(
        `📊 Lấy được ${orders.length} đơn hàng, tổng số: ${allOrders.length}`
      );

      // Kiểm tra xem còn dữ liệu không
      if (orders.length < pageSize) {
        hasMoreData = false;
      } else {
        currentItem += pageSize;
      }

      // Tránh giới hạn tốc độ API
      if (hasMoreData) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Loại bỏ trùng lặp và lọc theo trạng thái
    const uniqueOrders = Array.from(
      new Map(allOrders.map((order) => [order.id, order])).values()
    );

    // Lọc theo trạng thái (1: Phiếu tạm, 2: Đã xác nhận, 3: Đã hủy)
    const validOrders = uniqueOrders.filter((order) =>
      [1, 2, 3].includes(order.status)
    );

    console.log(
      `✅ Đã lọc được ${validOrders.length} đơn hàng hợp lệ từ ${uniqueOrders.length} đơn hàng duy nhất`
    );

    return validOrders;
  } catch (error) {
    console.error("❌ Lỗi khi lấy đơn hàng gần đây:", error.message);
    if (error.response) {
      console.error(
        "Chi tiết lỗi:",
        error.response.status,
        error.response.data
      );
    }
    return [];
  }
}

/**
 * Lấy tất cả đơn hàng đã lưu trong 14 ngày
 */
async function getAllSavedOrders() {
  try {
    const allOrders = [];

    // Tạo danh sách 14 ngày gần nhất
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0]; // Định dạng YYYY-MM-DD
      const filePath = path.resolve(DATA_DIR, `orders_${dateStr}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const data = fs.readFileSync(filePath, "utf8");
          const orders = JSON.parse(data);
          console.log(`📊 Đã tải ${orders.length} đơn hàng từ ${dateStr}`);
          allOrders.push(...orders);
        } catch (err) {
          console.error(`❌ Lỗi đọc file ${filePath}: ${err.message}`);
        }
      }
    }

    // Loại bỏ trùng lặp
    const uniqueOrders = [];
    const orderIdSet = new Set();

    for (const order of allOrders) {
      if (order && order.id && !orderIdSet.has(order.id)) {
        orderIdSet.add(order.id);
        uniqueOrders.push(order);
      }
    }

    console.log(
      `📊 Tổng số đơn hàng duy nhất từ tất cả các ngày: ${uniqueOrders.length}`
    );
    return uniqueOrders;
  } catch (error) {
    console.error("❌ Lỗi khi lấy tất cả đơn hàng đã lưu:", error.message);
    return [];
  }
}

/**
 * Lấy danh sách hóa đơn gần đây
 */

/**
 * Lưu đơn hàng vào file lastOrders.json để tương thích ngược
 */
function saveCurrentData(orders) {
  try {
    // Kiểm tra đầu vào
    if (!orders) {
      console.error("❌ Không có dữ liệu đơn hàng để lưu");
      return;
    }

    if (!Array.isArray(orders)) {
      console.error("❌ Dữ liệu đơn hàng không phải là mảng");
      return;
    }

    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(ORDERS_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📂 Tạo thư mục: ${dirPath}`);
      } catch (mkdirError) {
        console.error("❌ Lỗi tạo thư mục:", mkdirError);
        return;
      }
    }

    // Loại bỏ các đơn hàng trùng lặp dựa trên ID
    const uniqueOrders = Array.from(
      new Map(orders.map((order) => [order.id, order])).values()
    );

    // Lọc chỉ lấy các đơn hàng ở trạng thái phù hợp
    const validOrders = uniqueOrders.filter(
      (order) => order.status === 1 || order.status === 2 || order.status === 3
    );

    console.log(
      `🔍 Đã lọc ${validOrders.length} đơn hàng hợp lệ từ ${uniqueOrders.length} đơn hàng duy nhất`
    );

    // Chuẩn bị dữ liệu để lưu
    const dataToSave = {
      timestamp: new Date().toISOString(),
      totalOrders: validOrders.length,
      orders: validOrders,
    };

    // Ghi file
    try {
      fs.writeFileSync(
        ORDERS_FILE_PATH,
        JSON.stringify(dataToSave, null, 2),
        "utf8"
      );

      console.log(
        `💾 Đã lưu ${validOrders.length} đơn hàng duy nhất vào ${ORDERS_FILE_PATH}`
      );
    } catch (writeError) {
      console.error("❌ Lỗi ghi file:", writeError);

      // Thử ghi lại với quyền cao hơn nếu cần
      try {
        fs.chmodSync(ORDERS_FILE_PATH, 0o666);
        fs.writeFileSync(
          ORDERS_FILE_PATH,
          JSON.stringify(dataToSave, null, 2),
          "utf8"
        );
        console.log("✅ Đã ghi file thành công sau khi điều chỉnh quyền");
      } catch (rechmodError) {
        console.error(
          "❌ Không thể ghi file ngay cả sau khi điều chỉnh quyền:",
          rechmodError
        );
      }
    }
  } catch (error) {
    console.error("❌ Lỗi không mong đợi trong quá trình lưu dữ liệu:", error);
    console.error("Chi tiết lỗi:", error.stack);
  }
}

/**
 * So sánh đơn hàng với hóa đơn
 */
function compareOrdersWithInvoices(orders, invoices) {
  try {
    const comparisons = [];

    // Lọc ra các hóa đơn gốc (không có hậu tố .0x)
    const originalInvoices = invoices.filter((invoice) => {
      const code = invoice.code || "";
      return !code.match(/\.\d+$/);
    });

    console.log(
      `🔍 Tìm thấy ${originalInvoices.length} hóa đơn gốc để so sánh với đơn hàng`
    );

    // Duyệt qua từng đơn hàng
    for (const order of orders) {
      // Tìm hóa đơn gốc có cùng mã với đơn hàng
      const matchingInvoice = originalInvoices.find(
        (invoice) => invoice.orderCode === order.code
      );

      if (matchingInvoice) {
        // So sánh chi tiết giữa đơn hàng và hóa đơn
        const differences = compareOrderAndInvoiceDetails(
          order,
          matchingInvoice
        );

        if (differences.hasChanges) {
          comparisons.push({
            order,
            invoice: matchingInvoice,
            differences,
          });
        }
      }
    }

    console.log(
      `🔍 Tìm thấy ${comparisons.length} cặp đơn hàng-hóa đơn có sự khác biệt`
    );
    return comparisons;
  } catch (error) {
    console.error("❌ Lỗi khi so sánh đơn hàng với hóa đơn:", error.message);
    return [];
  }
}

/**
 * So sánh chi tiết giữa đơn hàng và hóa đơn
 */
function compareOrderAndInvoiceDetails(order, invoice) {
  try {
    const comparison = {
      addedProducts: [], // Sản phẩm có trong hóa đơn nhưng không có trong đơn hàng
      removedProducts: [], // Sản phẩm có trong đơn hàng nhưng không có trong hóa đơn
      quantityChanges: [], // Sản phẩm có thay đổi số lượng
      hasChanges: false, // Đánh dấu có sự khác biệt
    };

    // Kiểm tra nếu không có chi tiết đơn hàng hoặc hóa đơn
    if (!order.orderDetails || !invoice.invoiceDetails) {
      return comparison;
    }

    // Tạo map từ chi tiết đơn hàng
    const orderDetailsMap = new Map();
    order.orderDetails.forEach((detail) => {
      if (detail.productId) {
        orderDetailsMap.set(detail.productId, detail);
      }
    });

    // Tạo map từ chi tiết hóa đơn
    const invoiceDetailsMap = new Map();
    invoice.invoiceDetails.forEach((detail) => {
      if (detail.productId) {
        invoiceDetailsMap.set(detail.productId, detail);
      }
    });

    // Kiểm tra sản phẩm thêm mới
    for (const [productId, invoiceDetail] of invoiceDetailsMap) {
      if (!orderDetailsMap.has(productId)) {
        comparison.addedProducts.push(invoiceDetail);
        comparison.hasChanges = true;
      }
    }

    // Kiểm tra sản phẩm bị xóa
    for (const [productId, orderDetail] of orderDetailsMap) {
      if (!invoiceDetailsMap.has(productId)) {
        comparison.removedProducts.push(orderDetail);
        comparison.hasChanges = true;
      }
    }

    // Kiểm tra sản phẩm thay đổi số lượng
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

    return comparison;
  } catch (error) {
    console.error(
      "❌ Lỗi khi so sánh chi tiết đơn hàng và hóa đơn:",
      error.message
    );
    return { hasChanges: false };
  }
}
exports.compareOrderAndInvoiceDetails = compareOrderAndInvoiceDetails;

/**
 * So sánh các phiên bản hóa đơn
 */
function compareInvoiceVersions(invoices) {
  try {
    const comparisons = [];

    // Tìm tất cả các hóa đơn có mã dạng .0x
    const revisedInvoices = invoices.filter((invoice) => {
      const code = invoice.code || "";
      return code.match(/\.\d+$/);
    });

    console.log(
      `🔍 Tìm thấy ${revisedInvoices.length} hóa đơn đã điều chỉnh (định dạng .0x)`
    );

    // Duyệt qua từng hóa đơn đã điều chỉnh
    for (const revisedInvoice of revisedInvoices) {
      // Trích xuất thông tin về phiên bản và mã gốc
      const versionInfo = extractInvoiceVersion(revisedInvoice.code);

      if (versionInfo.isRevised) {
        // Tìm hóa đơn gốc
        const originalInvoice = invoices.find(
          (invoice) => invoice.code === versionInfo.baseCode
        );

        if (originalInvoice) {
          // So sánh chi tiết giữa hóa đơn gốc và hóa đơn đã điều chỉnh
          const differences = compareInvoiceDetails(
            originalInvoice,
            revisedInvoice
          );

          if (differences.hasChanges) {
            comparisons.push({
              originalInvoice,
              revisedInvoice,
              differences,
              versionInfo,
            });
          }
        }
      }
    }

    console.log(
      `🔍 Tìm thấy ${comparisons.length} cặp phiên bản hóa đơn có sự khác biệt`
    );
    return comparisons;
  } catch (error) {
    console.error("❌ Lỗi khi so sánh các phiên bản hóa đơn:", error.message);
    return [];
  }
}

/**
 * Trích xuất thông tin phiên bản hóa đơn
 */
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

/**
 * So sánh chi tiết giữa hóa đơn gốc và hóa đơn điều chỉnh
 */
function compareInvoiceDetails(originalInvoice, revisedInvoice) {
  try {
    const comparison = {
      addedProducts: [], // Sản phẩm có trong hóa đơn điều chỉnh nhưng không có trong hóa đơn gốc
      removedProducts: [], // Sản phẩm có trong hóa đơn gốc nhưng không có trong hóa đơn điều chỉnh
      quantityChanges: [], // Sản phẩm có thay đổi số lượng
      totalChanged: false, // Đánh dấu có thay đổi tổng tiền
      oldTotal: null, // Tổng tiền cũ
      newTotal: null, // Tổng tiền mới
      hasChanges: false, // Đánh dấu có sự khác biệt
    };

    // Kiểm tra thay đổi tổng tiền
    if (originalInvoice.total !== revisedInvoice.total) {
      comparison.totalChanged = true;
      comparison.oldTotal = originalInvoice.total;
      comparison.newTotal = revisedInvoice.total;
      comparison.hasChanges = true;
    }

    // Kiểm tra nếu không có chi tiết hóa đơn
    if (!originalInvoice.invoiceDetails || !revisedInvoice.invoiceDetails) {
      return comparison;
    }

    // Tạo map từ chi tiết hóa đơn gốc
    const originalDetailsMap = new Map();
    originalInvoice.invoiceDetails.forEach((detail) => {
      if (detail.productId) {
        originalDetailsMap.set(detail.productId, detail);
      }
    });

    // Tạo map từ chi tiết hóa đơn điều chỉnh
    const revisedDetailsMap = new Map();
    revisedInvoice.invoiceDetails.forEach((detail) => {
      if (detail.productId) {
        revisedDetailsMap.set(detail.productId, detail);
      }
    });

    // Kiểm tra sản phẩm thêm mới
    for (const [productId, revisedDetail] of revisedDetailsMap) {
      if (!originalDetailsMap.has(productId)) {
        comparison.addedProducts.push(revisedDetail);
        comparison.hasChanges = true;
      }
    }

    // Kiểm tra sản phẩm bị xóa
    for (const [productId, originalDetail] of originalDetailsMap) {
      if (!revisedDetailsMap.has(productId)) {
        comparison.removedProducts.push(originalDetail);
        comparison.hasChanges = true;
      }
    }

    // Kiểm tra sản phẩm thay đổi số lượng
    for (const [productId, revisedDetail] of revisedDetailsMap) {
      if (originalDetailsMap.has(productId)) {
        const originalDetail = originalDetailsMap.get(productId);
        if (revisedDetail.quantity !== originalDetail.quantity) {
          comparison.quantityChanges.push({
            product: revisedDetail,
            originalQuantity: originalDetail.quantity,
            newQuantity: revisedDetail.quantity,
            difference: revisedDetail.quantity - originalDetail.quantity,
          });
          comparison.hasChanges = true;
        }
      }
    }

    return comparison;
  } catch (error) {
    console.error("❌ Lỗi khi so sánh chi tiết hóa đơn:", error.message);
    return { hasChanges: false };
  }
}

/**
 * Chạy báo cáo ngay lập tức
 */
async function runReportNow() {
  console.log("🚀 Chạy báo cáo thủ công...");
  try {
    // Cập nhật dữ liệu đơn hàng trong 14 ngày
    await fetchAndStoreOrdersForLast14Days();

    // Lấy tất cả các đơn hàng đã lưu
    const allSavedOrders = await getAllSavedOrders();
    console.log(
      `📊 Đã tải ${allSavedOrders.length} đơn hàng đã lưu để so sánh`
    );

    // Lọc các đơn hàng ở trạng thái "Phiếu tạm" (status=1), "Đã xác nhận" (status=2) hoặc "Đã hủy" (status=3)
    const validOrders = allSavedOrders.filter(
      (order) => order.status === 1 || order.status === 2 || order.status === 3
    );
    console.log(
      `🔍 Đã lọc ${validOrders.length} đơn hàng với trạng thái hợp lệ từ dữ liệu đã lưu`
    );

    // Lấy danh sách hóa đơn hiện tại
    const currentInvoices = await invoiceScanner.getRecentInvoices();
    console.log(`📊 Đã lấy ${currentInvoices.length} hóa đơn từ KiotViet`);

    // So sánh đơn hàng với hóa đơn
    const orderInvoiceComparisons = compareOrdersWithInvoices(
      validOrders,
      currentInvoices
    );

    // Gửi thông báo cho các so sánh có sự khác biệt
    if (orderInvoiceComparisons.length > 0) {
      console.log(
        `🔔 Tìm thấy ${orderInvoiceComparisons.length} đơn hàng có sự khác biệt so với hóa đơn`
      );

      for (const comparison of orderInvoiceComparisons) {
        try {
          await lark.sendOrderInvoiceComparisonReport(comparison);
          console.log(
            `✅ Đã gửi báo cáo so sánh cho đơn hàng ${comparison.order.code} và hóa đơn ${comparison.invoice.code}`
          );
        } catch (err) {
          console.error(
            `❌ Lỗi gửi báo cáo so sánh cho đơn hàng ${comparison.order.code}:`,
            err.message
          );
        }
      }
    } else {
      console.log("✅ Không tìm thấy sự khác biệt giữa đơn hàng và hóa đơn");
    }

    // So sánh hóa đơn gốc với các phiên bản điều chỉnh
    const invoiceVersionComparisons = compareInvoiceVersions(currentInvoices);

    // Gửi thông báo cho các so sánh có sự khác biệt
    if (invoiceVersionComparisons.length > 0) {
      console.log(
        `🔔 Tìm thấy ${invoiceVersionComparisons.length} hóa đơn điều chỉnh có sự khác biệt`
      );

      for (const comparison of invoiceVersionComparisons) {
        try {
          await lark.sendInvoiceVersionComparisonReport(comparison);
          console.log(
            `✅ Đã gửi báo cáo so sánh cho hóa đơn ${comparison.originalInvoice.code} và phiên bản điều chỉnh ${comparison.revisedInvoice.code}`
          );
        } catch (err) {
          console.error(
            `❌ Lỗi gửi báo cáo so sánh cho hóa đơn ${comparison.originalInvoice.code}:`,
            err.message
          );
        }
      }
    } else {
      console.log("✅ Không tìm thấy sự khác biệt giữa các phiên bản hóa đơn");
    }

    // Cập nhật file lastOrders.json để tương thích ngược
    saveCurrentData(validOrders);

    return {
      success: true,
      message: "Báo cáo đã được thực thi thành công",
    };
  } catch (error) {
    console.error("❌ Lỗi khi chạy báo cáo thủ công:", error.message);
    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  setupPeriodicCheck,
  runReportNow,
};
