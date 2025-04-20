// src/excelExporter.js
const Excel = require("exceljs");
const fs = require("fs");
const path = require("path");

// Đường dẫn lưu file Excel
const EXCEL_FOLDER_PATH = path.resolve(process.cwd(), "excel");

// Biến cờ kiểm tra quá trình xuất đang diễn ra hay không
let isExportingInProgress = false;

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(EXCEL_FOLDER_PATH)) {
  fs.mkdirSync(EXCEL_FOLDER_PATH, { recursive: true });
}

/**
 * Xuất danh sách đơn hàng hoàn thành ra file Excel
 * @param {Array} orders Danh sách đơn hàng cần xuất
 * @returns {String} Đường dẫn đến file Excel đã xuất
 */
async function exportOrdersToExcel(orders) {
  if (isExportingInProgress) {
    console.log("Đang có quá trình xuất Excel khác, bỏ qua lần này");
    return null;
  }

  // Đánh dấu bắt đầu xuất Excel
  isExportingInProgress = true;

  let filePath = null;
  try {
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      console.log("Không có đơn hàng để xuất Excel");
      isExportingInProgress = false;
      return null;
    }

    // Lọc chỉ lấy đơn hàng hoàn thành (status = 3)
    const completedOrders = orders.filter((order) => order.status === 3);

    if (completedOrders.length === 0) {
      console.log("Không có đơn hàng hoàn thành để xuất Excel");
      isExportingInProgress = false;
      return null;
    }

    // Tạo tên file với ngày hiện tại và timestamp để tránh trùng lặp
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = new Date().getTime();
    const filename = `completed-orders-${date}-${timestamp}.xlsx`;
    filePath = path.join(EXCEL_FOLDER_PATH, filename);

    // Tạo workbook mới
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet("Đơn hàng hoàn thành");

    // Lấy danh sách tất cả các trường từ đơn hàng đầu tiên
    const firstOrder = completedOrders[0];
    const allFields = getAllFields(firstOrder);

    // Tạo columns từ danh sách trường
    const columns = allFields.map((field) => ({
      header: formatFieldName(field),
      key: field,
      width: getColumnWidth(field),
    }));

    worksheet.columns = columns;

    // Định dạng các cột
    formatColumns(worksheet);

    // Thêm dữ liệu đơn hàng
    for (const order of completedOrders) {
      const orderData = {};

      // Duyệt qua tất cả các trường có thể có
      allFields.forEach((field) => {
        if (field.includes(".")) {
          // Trường hợp trường lồng nhau (nested)
          const [parent, child] = field.split(".");
          orderData[field] = order[parent] ? order[parent][child] : null;
        } else {
          // Trường hợp trường thông thường
          orderData[field] = order[field];
        }
      });

      worksheet.addRow(orderData);
    }

    // Tạo worksheet cho chi tiết sản phẩm
    const productSheet = workbook.addWorksheet("Chi tiết sản phẩm");

    // Xác định tất cả các trường cho chi tiết sản phẩm
    let productFields = [];
    completedOrders.forEach((order) => {
      if (order.orderDetails) {
        const details = Array.isArray(order.orderDetails)
          ? order.orderDetails
          : [order.orderDetails];
        if (details.length > 0) {
          const detailFields = Object.keys(details[0]);
          detailFields.forEach((field) => {
            if (!productFields.includes(field)) {
              productFields.push(field);
            }
          });
        }
      }
    });

    // Thêm trường mã đơn hàng
    productFields = ["orderCode", ...productFields];

    // Tạo columns từ danh sách trường chi tiết sản phẩm
    const productColumns = productFields.map((field) => ({
      header: formatFieldName(field),
      key: field,
      width: getColumnWidth(field),
    }));

    productSheet.columns = productColumns;

    // Định dạng các cột
    formatColumns(productSheet);

    // Thêm dữ liệu chi tiết sản phẩm
    for (const order of completedOrders) {
      if (order.orderDetails) {
        const details = Array.isArray(order.orderDetails)
          ? order.orderDetails
          : [order.orderDetails];

        details.forEach((detail) => {
          const productData = { orderCode: order.code };

          productFields.forEach((field) => {
            if (field !== "orderCode") {
              productData[field] = detail[field];
            }
          });

          productSheet.addRow(productData);
        });
      }
    }

    // Định dạng tiêu đề
    [worksheet, productSheet].forEach((sheet) => {
      // Định dạng header
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };

      // Tự động lọc dữ liệu
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    });

    // Lưu workbook
    await workbook.xlsx.writeFile(filePath);
    console.log(`Đã xuất file Excel thành công: ${filePath}`);

    // Kiểm tra xem file có tồn tại không
    if (fs.existsSync(filePath)) {
      // Lưu trữ thêm thông tin file đã xuất để theo dõi
      const exportLog = path.join(process.cwd(), "excel-exports.log");
      fs.appendFileSync(
        exportLog,
        `${new Date().toISOString()} - Đã xuất: ${filename} - ${
          completedOrders.length
        } đơn hàng\n`
      );

      return filePath;
    } else {
      throw new Error("File không được tạo mặc dù không có lỗi");
    }
  } catch (error) {
    console.error("Lỗi khi xuất Excel:", error.message);

    // Nếu file đã được tạo một phần, xóa để tránh file hỏng
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Đã xóa file Excel không hoàn chỉnh: ${filePath}`);
      } catch (unlinkError) {
        console.error("Không thể xóa file Excel lỗi:", unlinkError.message);
      }
    }

    return null;
  } finally {
    // Đảm bảo reset trạng thái xuất dù có lỗi hay không
    isExportingInProgress = false;
  }
}

/**
 * Xuất danh sách hóa đơn ra file Excel
 * @param {Array} invoices Danh sách hóa đơn cần xuất
 * @returns {String} Đường dẫn đến file Excel đã xuất
 */
async function exportInvoicesToExcel(invoices) {
  if (isExportingInProgress) {
    console.log("Đang có quá trình xuất Excel khác, bỏ qua lần này");
    return null;
  }

  isExportingInProgress = true;

  try {
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      isExportingInProgress = false;
      return null;
    }

    // Tạo tên file với ngày hiện tại
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = new Date().getTime();
    const filename = `invoices-${date}-${timestamp}.xlsx`;
    const filePath = path.join(EXCEL_FOLDER_PATH, filename);

    // Tạo workbook mới
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet("Hóa đơn");

    // Lấy danh sách tất cả các trường từ hóa đơn đầu tiên
    const firstInvoice = invoices[0];
    const allFields = getAllFields(firstInvoice);

    // Tạo columns từ danh sách trường
    const columns = allFields.map((field) => ({
      header: formatFieldName(field),
      key: field,
      width: getColumnWidth(field),
    }));

    worksheet.columns = columns;

    // Định dạng các cột
    formatColumns(worksheet);

    // Thêm dữ liệu hóa đơn
    for (const invoice of invoices) {
      const invoiceData = {};

      // Duyệt qua tất cả các trường có thể có
      allFields.forEach((field) => {
        if (field.includes(".")) {
          // Trường hợp trường lồng nhau (nested)
          const [parent, child] = field.split(".");
          invoiceData[field] = invoice[parent] ? invoice[parent][child] : null;
        } else {
          // Trường hợp trường thông thường
          invoiceData[field] = invoice[field];
        }
      });

      worksheet.addRow(invoiceData);
    }

    // Tạo worksheet cho chi tiết sản phẩm
    const productSheet = workbook.addWorksheet("Chi tiết sản phẩm");

    // Xác định tất cả các trường cho chi tiết sản phẩm
    let productFields = [];
    invoices.forEach((invoice) => {
      if (invoice.invoiceDetails) {
        const details = Array.isArray(invoice.invoiceDetails)
          ? invoice.invoiceDetails
          : [invoice.invoiceDetails];
        if (details.length > 0) {
          const detailFields = Object.keys(details[0]);
          detailFields.forEach((field) => {
            if (!productFields.includes(field)) {
              productFields.push(field);
            }
          });
        }
      }
    });

    // Thêm trường mã hóa đơn
    productFields = ["invoiceCode", ...productFields];

    // Tạo columns từ danh sách trường chi tiết sản phẩm
    const productColumns = productFields.map((field) => ({
      header: formatFieldName(field),
      key: field,
      width: getColumnWidth(field),
    }));

    productSheet.columns = productColumns;

    // Định dạng các cột
    formatColumns(productSheet);

    // Thêm dữ liệu chi tiết sản phẩm
    for (const invoice of invoices) {
      if (invoice.invoiceDetails) {
        const details = Array.isArray(invoice.invoiceDetails)
          ? invoice.invoiceDetails
          : [invoice.invoiceDetails];

        details.forEach((detail) => {
          const productData = { invoiceCode: invoice.code };

          productFields.forEach((field) => {
            if (field !== "invoiceCode") {
              productData[field] = detail[field];
            }
          });

          productSheet.addRow(productData);
        });
      }
    }

    // Định dạng tiêu đề
    [worksheet, productSheet].forEach((sheet) => {
      // Định dạng header
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };

      // Tự động lọc dữ liệu
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    });

    // Lưu workbook
    await workbook.xlsx.writeFile(filePath);
    console.log(`Đã xuất file Excel thành công: ${filePath}`);

    return filePath;
  } catch (error) {
    console.error("Lỗi khi xuất hóa đơn ra Excel:", error.message);
    return null;
  } finally {
    isExportingInProgress = false;
  }
}

/**
 * Lấy tất cả các trường từ một đối tượng (bao gồm cả các trường lồng nhau cấp 1)
 * @param {Object} obj Đối tượng cần lấy các trường
 * @returns {Array} Danh sách các trường
 */
function getAllFields(obj) {
  if (!obj) return [];

  const fields = [];

  // Duyệt qua tất cả các trường cấp 1
  Object.keys(obj).forEach((key) => {
    // Bỏ qua các trường là mảng hoặc là null/undefined
    if (
      obj[key] !== null &&
      typeof obj[key] === "object" &&
      !Array.isArray(obj[key])
    ) {
      // Nếu là đối tượng, thêm các trường con dưới dạng 'parent.child'
      Object.keys(obj[key]).forEach((childKey) => {
        // Chỉ lấy các trường con có giá trị cơ bản (không phải đối tượng hoặc mảng)
        if (
          obj[key][childKey] === null ||
          typeof obj[key][childKey] !== "object" ||
          (typeof obj[key][childKey] === "object" &&
            obj[key][childKey] instanceof Date)
        ) {
          fields.push(`${key}.${childKey}`);
        }
      });
    } else if (!Array.isArray(obj[key])) {
      // Nếu là giá trị cơ bản, thêm vào danh sách trường
      fields.push(key);
    }
  });

  return fields;
}

/**
 * Định dạng tên trường để hiển thị trong Excel
 * @param {String} fieldName Tên trường
 * @returns {String} Tên trường đã định dạng
 */
function formatFieldName(fieldName) {
  if (fieldName.includes(".")) {
    const [parent, child] = fieldName.split(".");
    return `${formatSingleField(parent)} - ${formatSingleField(child)}`;
  }

  return formatSingleField(fieldName);
}

/**
 * Định dạng một tên trường đơn lẻ
 * @param {String} field Tên trường
 * @returns {String} Tên trường đã định dạng
 */
function formatSingleField(field) {
  // Chuyển camelCase thành Title Case với khoảng trắng
  return field
    .replace(/([A-Z])/g, " $1") // Thêm khoảng trắng trước chữ hoa
    .replace(/^./, (str) => str.toUpperCase()) // Viết hoa chữ cái đầu
    .trim();
}

/**
 * Xác định chiều rộng cột dựa trên tên trường
 * @param {String} fieldName Tên trường
 * @returns {Number} Chiều rộng cột
 */
function getColumnWidth(fieldName) {
  // Các trường nhất định cần chiều rộng lớn hơn
  const wideFields = ["name", "description", "address", "note"];
  const mediumFields = ["code", "email", "phone", "contactNumber"];

  if (wideFields.some((field) => fieldName.toLowerCase().includes(field))) {
    return 40;
  } else if (
    mediumFields.some((field) => fieldName.toLowerCase().includes(field))
  ) {
    return 20;
  } else {
    return 15;
  }
}

/**
 * Định dạng các cột dựa trên tên cột
 * @param {Worksheet} worksheet Worksheet cần định dạng
 */
function formatColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    const fieldName = column.key.toLowerCase();

    // Định dạng các cột ngày tháng
    if (fieldName.includes("date") || fieldName.includes("time")) {
      column.numFmt = "dd/mm/yyyy hh:mm:ss";
    }

    // Định dạng các cột tiền tệ
    if (
      fieldName.includes("price") ||
      fieldName.includes("total") ||
      fieldName.includes("amount") ||
      fieldName.includes("payment")
    ) {
      column.numFmt = "#,##0 đ";
    }
  });
}

module.exports = {
  exportOrdersToExcel,
  exportInvoicesToExcel,
};
