const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const kiotviet = require("./kiotviet");

const ORDERS_FILE_PATH = path.join(__dirname, "orders.json");
const INVOICES_FILE_PATH = path.join(__dirname, "invoices.json");
const PRODUCTS_FILE_PATH = path.join(__dirname, "products.json");
const SCAN_PROGRESS_FILE = path.join(__dirname, "scan_progress.json");

const ORDERS_EXCEL_PATH = path.join(__dirname, "orders.xlsx");
const INVOICES_EXCEL_PATH = path.join(__dirname, "invoices.xlsx");
const PRODUCTS_EXCEL_PATH = path.join(__dirname, "products.xlsx");

function saveScanProgress(date) {
  fs.writeFileSync(
    SCAN_PROGRESS_FILE,
    JSON.stringify({ lastScannedDate: date }),
    "utf8"
  );
}

function loadScanProgress() {
  try {
    if (fs.existsSync(SCAN_PROGRESS_FILE)) {
      const data = fs.readFileSync(SCAN_PROGRESS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading scan progress:", error);
  }
  return { lastScannedDate: null };
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function getDatesInRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    dates.push(formatDate(new Date(currentDate)));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

function getStartDateFromDaysAgo(daysAgo) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - daysAgo);
  return startDate;
}

function loadExistingOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading existing orders:", error);
  }
  return { orders: [] };
}

function loadExistingInvoices() {
  try {
    if (fs.existsSync(INVOICES_FILE_PATH)) {
      const data = fs.readFileSync(INVOICES_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log("Error loading existing invoices:", error);
  }

  return { invoices: [] };
}

function loadExistingProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE_PATH)) {
      const data = fs.readFileSync(PRODUCTS_FILE_PATH, "utf-8");

      return JSON.parse(data);
    }
  } catch (error) {
    console.log("Error loading existing products", error);
  }

  return { products: [] };
}

function mergeAndSaveOrders(existingData, newOrders) {
  const orderMap = new Map();

  existingData.orders.forEach((order) => {
    orderMap.set(order.id, order);
  });

  if (newOrders && newOrders.data) {
    newOrders.data.forEach((order) => {
      orderMap.set(order.id, order);
    });
  }

  const mergedOrders = [...orderMap.values()];

  const updatedData = {
    total: mergedOrders.length,
    lastUpdated: new Date().toISOString(),
    orders: mergedOrders,
  };

  // Save to file
  fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(updatedData, null, 2));

  return updatedData;
}

function mergeAndSaveInvoices(existingData, newInvoices) {
  const invoiceMap = new Map();
  existingData.invoices.forEach((invoice) => {
    invoiceMap.set(invoice.id, invoice);
  });

  if (newInvoices && newInvoices.data) {
    newInvoices.data.forEach((invoice) => {
      invoiceMap.set(invoice.id, invoice);
    });
  }

  const mergedInvoices = [...invoiceMap.values()];

  const updateData = {
    total: mergedInvoices.length,
    lastUpdated: new Date().toISOString(),
    invoices: mergedInvoices,
  };

  fs.writeFileSync(INVOICES_FILE_PATH, JSON.stringify(updateData, null, 2));

  return updateData;
}

function mergeAndSaveProducts(existingData, newProducts) {
  const productMap = new Map();

  if (existingData && existingData.products) {
    existingData.products.forEach((product) => {
      productMap.set(product.id, product);
    });
  }

  if (newProducts && newProducts.data && Array.isArray(newProducts.data)) {
    newProducts.data.forEach((product) => {
      productMap.set(product.id, product);
    });
  }

  const mergedProducts = [...productMap.values()];

  const updatedData = {
    total: mergedProducts.length,
    lastUpdated: new Date().toISOString(),
    products: mergedProducts,
  };

  // Save to file
  fs.writeFileSync(PRODUCTS_FILE_PATH, JSON.stringify(updatedData, null, 2));

  return updatedData;
}

async function fetchOrdersForDate(date) {
  try {
    console.log(`Fetching orders for date: ${date}`);
    const orders = await kiotviet.getOrdersByDate(date);
    console.log(
      `Successfully fetched ${orders?.data?.length || 0} orders for ${date}`
    );
    return orders;
  } catch (error) {
    console.error(`Error fetching orders for date ${date}:`, error.message);
    return null;
  }
}

async function fetchInvoicesForDate(date) {
  try {
    console.log(`Fetching invoices for date: ${date}`);
    const invoices = await kiotviet.getInvoicesByDate(date);
    console.log(
      `Successfully fetched ${invoices?.data?.length || 0} invoices for ${date}`
    );
    return invoices;
  } catch (error) {
    console.error(`Error fetching invoices for date ${date}:`, error.message);
    return null;
  }
}

async function scanOrdersForDays(days = 1) {
  const today = new Date();
  const startDate = getStartDateFromDaysAgo(days);
  const endDate = today;

  console.log(
    `Scanning orders from ${formatDate(startDate)} to ${formatDate(endDate)}`
  );

  const progress = loadScanProgress();
  let dates = getDatesInRange(startDate, endDate);

  if (progress.lastScannedDate) {
    const lastScannedDateObj = new Date(progress.lastScannedDate);
    lastScannedDateObj.setDate(lastScannedDateObj.getDate() + 1);

    dates = dates.filter((date) => {
      return new Date(date) >= lastScannedDateObj;
    });

    console.log(
      `Continuing from ${formatDate(
        lastScannedDateObj
      )} based on previous progress`
    );
  }

  let existingData = loadExistingOrders();

  for (const date of dates) {
    try {
      console.log(`Fetching orders for date: ${date}`);
      const ordersForDate = await kiotviet.getOrdersByDate(date);

      if (ordersForDate) {
        existingData = mergeAndSaveOrders(existingData, ordersForDate);
        console.log(
          `Updated orders.json with ${
            ordersForDate?.data?.length || 0
          } orders from ${date}`
        );
      }

      saveScanProgress(date);
    } catch (error) {
      console.error(`Error processing date ${date}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  console.log(`Completed scanning orders for the last ${days} days`);
  return existingData;
}

async function scanInvoicesForDays(days = 1) {
  const today = new Date();
  const startDate = getStartDateFromDaysAgo(days);
  const endDate = today;

  console.log(
    `Scanning invoices from ${formatDate(startDate)} to ${formatDate(endDate)}`
  );
  const progress = loadScanProgress();
  let dates = getDatesInRange(startDate, endDate);

  if (progress.lastScannedDate) {
    const lastScannedDateObj = new Date(progress.lastScannedDate);

    lastScannedDateObj.setDate(lastScannedDateObj.getDate() + 1);

    dates = dates.filter((date) => {
      return new Date(date) >= lastScannedDateObj;
    });
    console.log(
      `Continuing from ${formatDate(
        lastScannedDateObj
      )} based on previous progress`
    );
  }

  let existingData = loadExistingInvoices();

  for (const date of dates) {
    try {
      console.log(`Fetching invoices for date: ${date}`);

      const invoicesForDate = await kiotviet.getInvoicesByDate(date);

      if (invoicesForDate) {
        existingData = mergeAndSaveInvoices(existingData, invoicesForDate);

        console.log(
          `Updated invoices.json with ${
            invoicesForDate?.data?.length || 0
          } invoices from ${date}`
        );
      }

      saveScanProgress(date);
    } catch (error) {
      console.log(`Error progressing date ${date}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  console.log(`Completed scanning invoices for the last ${days} days`);

  return existingData;
}

async function scanProductsForDays(days = 160) {
  const today = new Date();
  const startDate = getStartDateFromDaysAgo(days);
  const endDate = today;

  console.log(
    `Scanning products from ${formatDate(startDate)} to ${formatDate(endDate)}`
  );

  const progress = loadScanProgress();
  let dates = getDatesInRange(startDate, endDate);

  if (progress.lastScannedDate) {
    const lastScannedDateObj = new Date(progress.lastScannedDate);
    lastScannedDateObj.setDate(lastScannedDateObj.getDate() + 1);

    dates = dates.filter((date) => {
      return new Date(date) >= lastScannedDateObj;
    });

    console.log(
      `Continuing from ${formatDate(
        lastScannedDateObj
      )} based on previous progress`
    );
  }

  let existingData = loadExistingProducts();

  for (const date of dates) {
    try {
      console.log(`Fetching products for date: ${date}`);
      const productsForDate = await kiotviet.getProductsByDate(date);

      if (productsForDate) {
        existingData = mergeAndSaveProducts(existingData, productsForDate);
        console.log(
          `Updated products.json with ${
            productsForDate?.data?.length || 0
          } products from ${date}`
        );
      }

      saveScanProgress(date);
    } catch (error) {
      console.error(`Error processing date ${date}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  console.log(`Completed scanning products for the last ${days} days`);
  return existingData;
}

async function scanRecentOrders(hoursBack = 24) {
  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(now.getHours() - hoursBack);

  const today = formatDate(now);
  const startDay = formatDate(startTime);

  console.log(`Scanning recent orders from ${startDay} to ${today}`);

  const datesToScan = getDatesInRange(startTime, now);

  let existingData = loadExistingOrders();

  for (const date of datesToScan) {
    try {
      console.log(`Fetching orders for recent orders day: ${date}`);
      const ordersForDate = await kiotviet.getOrdersByDate(date);

      if (ordersForDate) {
        existingData = mergeAndSaveOrders(existingData, ordersForDate);

        console.log(
          `Updated orders.json with ${
            ordersForDate?.data?.length || 0
          } orders from ${date}`
        );
      }
    } catch (error) {
      console.error(
        `Error processing recent orders day ${date}:`,
        error.message
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  return existingData;
}

async function scanRecentInvoices(hoursBack = 24) {
  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(now.getHours() - hoursBack);

  const today = formatDate(now);
  const startDay = formatDate(startTime);

  console.log(`Scanning recent invoices from ${startDay} to ${today}`);

  // Nếu cần quét nhiều ngày (như trường hợp hoursBack > 24)
  const datesToScan = getDatesInRange(startTime, now);

  let existingData = loadExistingInvoices();

  for (const date of datesToScan) {
    try {
      console.log(`Fetching invoices for recent invoices day: ${date}`);
      const invoicesForDate = await kiotviet.getInvoicesByDate(date);

      if (invoicesForDate) {
        existingData = mergeAndSaveInvoices(existingData, invoicesForDate);

        console.log(
          `Updated invoices.json with ${
            invoicesForDate?.data?.length || 0
          } invoices from ${date}`
        );
      }
    } catch (error) {
      console.error(
        `Error processing recent invoices day ${date}:`,
        error.message
      );
    }

    // Brief pause to avoid hitting rate limits
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  return existingData;
}

async function scanRecentProducts(hoursBack = 24) {
  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(now.getHours() - hoursBack);

  const today = formatDate(now);
  const startDay = formatDate(startTime);

  console.log(`Scanning recent products from ${startDay} to ${today}`);

  const datesToScan = getDatesInRange(startTime, now);

  let existingData = loadExistingProducts();

  for (const date of datesToScan) {
    try {
      console.log(`Fetching products for recent products day: ${date}`);
      const productsForDate = await kiotviet.getProductsByDate(date);

      if (productsForDate) {
        existingData = mergeAndSaveProducts(existingData, productsForDate);

        console.log(
          `Updated products.json with ${
            productsForDate?.data?.length || 0
          } products from ${date}`
        );
      }
    } catch (error) {
      console.error(
        `Error processing recent products day ${date}:`,
        error.message
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  return existingData;
}

function convertOrdersToExcel() {
  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) {
      console.log("Orders file does not exist, skipping conversion");
      return false;
    }

    const ordersData = JSON.parse(fs.readFileSync(ORDERS_FILE_PATH, "utf8"));

    if (
      !ordersData.orders ||
      !Array.isArray(ordersData.orders) ||
      ordersData.orders.length === 0
    ) {
      console.log("No orders data to convert");
      return false;
    }

    const workbook = XLSX.utils.book_new();

    // Bảng ánh xạ tên cột tiếng Anh - tiếng Việt
    const fieldMappings = {
      // Sheet chính - Đơn hàng
      id: "ID",
      code: "Mã đơn hàng",
      purchaseDate: "Ngày đặt hàng",
      branchId: "ID Chi nhánh",
      branchName: "Tên chi nhánh",
      soldById: "ID Người bán",
      soldByName: "Tên người bán",
      customerId: "ID Khách hàng",
      customerCode: "Mã khách hàng",
      customerName: "Tên khách hàng",
      total: "Tổng tiền",
      totalPayment: "Đã thanh toán",
      discountRatio: "Chiết khấu %",
      discount: "Chiết khấu tiền",
      status: "Mã trạng thái",
      statusValue: "Trạng thái",
      description: "Ghi chú",
      createdDate: "Ngày tạo",
      modifiedDate: "Ngày cập nhật",
      retailerId: "ID Cửa hàng",
      usingCod: "Sử dụng COD",
      deliveryAddress: "Địa chỉ giao hàng",
      deliveryReceiver: "Người nhận",
      deliveryContactNumber: "SĐT người nhận",
      productCount: "Số sản phẩm",
      paymentCount: "Số thanh toán",
      PriceBookId: "ID Bảng giá",

      // Sheet chi tiết đơn hàng
      orderId: "ID Đơn hàng",
      orderCode: "Mã đơn hàng",
      productId: "ID Sản phẩm",
      productCode: "Mã sản phẩm",
      productName: "Tên sản phẩm",
      quantity: "Số lượng",
      price: "Đơn giá",
      note: "Ghi chú",
      isMaster: "Là sản phẩm chính",
      viewDiscount: "Hiển thị giảm giá",

      // Sheet thông tin giao hàng
      serviceType: "Loại dịch vụ",
      receiver: "Người nhận",
      contactNumber: "Số điện thoại",
      address: "Địa chỉ",
      locationId: "ID Khu vực",
      locationName: "Tên khu vực",
      wardId: "ID Phường/Xã",
      wardName: "Tên Phường/Xã",
      weight: "Cân nặng (gram)",
      length: "Chiều dài (cm)",
      width: "Chiều rộng (cm)",
      height: "Chiều cao (cm)",
      latestStatus: "Trạng thái mới nhất",

      // Sheet thông tin thanh toán
      method: "Phương thức",
      amount: "Số tiền",
      transDate: "Ngày giao dịch",
      bankAccount: "Tài khoản ngân hàng",
      accountId: "ID Tài khoản",
    };

    // Danh sách các trường boolean cần chuyển đổi
    const booleanFields = [
      "usingCod",
      "isActive",
      "isMaster",
      "allowsSale",
      "hasVariants",
      "isLotSerialControl",
      "isBatchExpireControl",
      "isRewardPoint",
      "viewDiscount",
      "gender",
      "forAllCusGroup",
      "forAllUser",
    ];

    // Tạo bản sao sâu của dữ liệu
    const flattenedOrders = JSON.parse(JSON.stringify(ordersData.orders));

    // Thu thập các trường mở rộng để tạo sheet riêng
    const orderDetailsCollection = [];
    const orderDeliveryCollection = [];
    const orderPaymentsCollection = [];
    const orderSurchargesCollection = [];

    // Làm phẳng dữ liệu và thu thập các chi tiết
    flattenedOrders.forEach((order) => {
      // Chuyển đổi các trường boolean trong đơn hàng chính
      for (const field of booleanFields) {
        if (order[field] !== undefined) {
          order[field] = order[field] === true ? "Có" : "Không";
        }
      }

      // Xử lý orderDetails
      if (order.orderDetails) {
        if (Array.isArray(order.orderDetails)) {
          // Nếu là mảng, thu thập tất cả
          order.orderDetails.forEach((detail) => {
            // Chuyển đổi các trường boolean trong chi tiết đơn hàng
            for (const field of booleanFields) {
              if (detail[field] !== undefined) {
                detail[field] = detail[field] === true ? "Có" : "Không";
              }
            }

            orderDetailsCollection.push({
              orderId: order.id,
              orderCode: order.code,
              ...detail,
            });
          });
        } else {
          // Nếu là đối tượng, thêm vào danh sách
          // Chuyển đổi các trường boolean trong chi tiết đơn hàng
          for (const field of booleanFields) {
            if (order.orderDetails[field] !== undefined) {
              order.orderDetails[field] =
                order.orderDetails[field] === true ? "Có" : "Không";
            }
          }

          orderDetailsCollection.push({
            orderId: order.id,
            orderCode: order.code,
            ...order.orderDetails,
          });
        }

        // Thêm số lượng sản phẩm vào đơn hàng chính
        order.productCount = Array.isArray(order.orderDetails)
          ? order.orderDetails.length
          : 1;

        // Xóa trường lồng để tránh lỗi khi chuyển sang Excel
        delete order.orderDetails;
      }

      // Xử lý orderDelivery
      if (order.orderDelivery) {
        // Chuyển đổi các trường boolean trong thông tin giao hàng
        for (const field of booleanFields) {
          if (order.orderDelivery[field] !== undefined) {
            order.orderDelivery[field] =
              order.orderDelivery[field] === true ? "Có" : "Không";
          }
        }

        // Thêm một số thông tin giao hàng vào đơn hàng chính
        order.deliveryAddress = order.orderDelivery.address || "";
        order.deliveryReceiver = order.orderDelivery.receiver || "";
        order.deliveryContactNumber = order.orderDelivery.contactNumber || "";

        // Thu thập cho sheet riêng
        orderDeliveryCollection.push({
          orderId: order.id,
          orderCode: order.code,
          ...order.orderDelivery,
        });

        // Xóa trường lồng
        delete order.orderDelivery;
      }

      // Xử lý payments
      if (order.payments && Array.isArray(order.payments)) {
        order.payments.forEach((payment) => {
          // Chuyển đổi các trường boolean trong thông tin thanh toán
          for (const field of booleanFields) {
            if (payment[field] !== undefined) {
              payment[field] = payment[field] === true ? "Có" : "Không";
            }
          }

          orderPaymentsCollection.push({
            orderId: order.id,
            orderCode: order.code,
            ...payment,
          });
        });

        // Thêm thông tin thanh toán vào đơn hàng chính
        order.paymentCount = order.payments.length;

        // Xóa trường lồng
        delete order.payments;
      }

      // Xử lý surcharges
      if (
        order.invoiceOrderSurcharges &&
        Array.isArray(order.invoiceOrderSurcharges)
      ) {
        order.invoiceOrderSurcharges.forEach((surcharge) => {
          // Chuyển đổi các trường boolean trong thông tin thu khác
          for (const field of booleanFields) {
            if (surcharge[field] !== undefined) {
              surcharge[field] = surcharge[field] === true ? "Có" : "Không";
            }
          }

          orderSurchargesCollection.push({
            orderId: order.id,
            orderCode: order.code,
            ...surcharge,
          });
        });

        // Xóa trường lồng
        delete order.invoiceOrderSurcharges;
      }

      // Xử lý những trường Extra và chuỗi JSON khác
      if (order.Extra && typeof order.Extra === "string") {
        try {
          // Cố gắng parse trường Extra nếu có thể, nhưng không làm gián đoạn quá trình nếu lỗi
          const extraData = JSON.parse(order.Extra);

          // Có thể trích xuất thông tin bổ sung từ Extra nếu cần
          if (extraData.Method && extraData.Method.Label) {
            order.paymentMethod = extraData.Method.Label;
          }

          // Xóa trường Extra để tránh lỗi khi chuyển sang Excel
          delete order.Extra;
        } catch (err) {
          // Nếu không parse được, giữ nguyên trường Extra
          console.log(`Could not parse Extra field for order ${order.code}`);
        }
      }
    });

    // Hàm tạo worksheet với tiêu đề tiếng Việt
    function createWorksheetWithVietnameseHeaders(data, sheetName) {
      // Tạo worksheet từ dữ liệu
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Lấy các tiêu đề hiện tại
      const headers = [];
      const range = XLSX.utils.decode_range(worksheet["!ref"]);

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (cell && cell.v) headers.push(cell.v);
      }

      // Thay đổi tiêu đề sang tiếng Việt
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (headerCell && headerCell.v && fieldMappings[headerCell.v]) {
          headerCell.v = fieldMappings[headerCell.v];
        }
      }

      return worksheet;
    }

    // Tạo worksheet cho đơn hàng chính
    const mainWorksheet = createWorksheetWithVietnameseHeaders(
      flattenedOrders,
      "Orders"
    );
    XLSX.utils.book_append_sheet(workbook, mainWorksheet, "Đơn hàng");

    // Tạo các sheet bổ sung nếu có dữ liệu
    if (orderDetailsCollection.length > 0) {
      const detailsWorksheet = createWorksheetWithVietnameseHeaders(
        orderDetailsCollection,
        "OrderDetails"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        detailsWorksheet,
        "Chi tiết đơn hàng"
      );
    }

    if (orderDeliveryCollection.length > 0) {
      const deliveryWorksheet = createWorksheetWithVietnameseHeaders(
        orderDeliveryCollection,
        "OrderDelivery"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        deliveryWorksheet,
        "Thông tin giao hàng"
      );
    }

    if (orderPaymentsCollection.length > 0) {
      const paymentsWorksheet = createWorksheetWithVietnameseHeaders(
        orderPaymentsCollection,
        "OrderPayments"
      );
      XLSX.utils.book_append_sheet(workbook, paymentsWorksheet, "Thanh toán");
    }

    if (orderSurchargesCollection.length > 0) {
      const surchargesWorksheet = createWorksheetWithVietnameseHeaders(
        orderSurchargesCollection,
        "OrderSurcharges"
      );
      XLSX.utils.book_append_sheet(workbook, surchargesWorksheet, "Thu khác");
    }

    // Ghi workbook ra file Excel
    XLSX.writeFile(workbook, ORDERS_EXCEL_PATH);

    console.log(`Successfully converted orders to Excel: ${ORDERS_EXCEL_PATH}`);
    return true;
  } catch (error) {
    console.error("Error converting orders to Excel:", error);
    return false;
  }
}

function convertInvoicesToExcel() {
  try {
    if (!fs.existsSync(INVOICES_FILE_PATH)) {
      console.log("Invoices file does not exist, skipping conversion");
      return false;
    }

    const invoicesData = JSON.parse(
      fs.readFileSync(INVOICES_FILE_PATH, "utf8")
    );

    if (
      !invoicesData.invoices ||
      !Array.isArray(invoicesData.invoices) ||
      invoicesData.invoices.length === 0
    ) {
      console.log("No invoices data to convert");
      return false;
    }

    const workbook = XLSX.utils.book_new();

    // Tạo bản sao sâu của dữ liệu
    const flattenedInvoices = JSON.parse(JSON.stringify(invoicesData.invoices));

    // Thu thập các trường mở rộng để tạo sheet riêng
    const invoiceDetailsCollection = [];
    const invoiceDeliveryCollection = [];
    const invoicePaymentsCollection = [];
    const invoiceSurchargesCollection = [];

    // Làm phẳng dữ liệu và thu thập các chi tiết
    flattenedInvoices.forEach((invoice) => {
      // Xử lý invoiceDetails
      if (invoice.invoiceDetails) {
        if (Array.isArray(invoice.invoiceDetails)) {
          invoice.invoiceDetails.forEach((detail) => {
            invoiceDetailsCollection.push({
              invoiceId: invoice.id,
              invoiceCode: invoice.code,
              ...detail,
            });
          });
        } else {
          invoiceDetailsCollection.push({
            invoiceId: invoice.id,
            invoiceCode: invoice.code,
            ...invoice.invoiceDetails,
          });
        }

        invoice.productCount = Array.isArray(invoice.invoiceDetails)
          ? invoice.invoiceDetails.length
          : 1;

        delete invoice.invoiceDetails;
      }

      // Xử lý deliveryDetail hoặc invoiceDelivery
      const deliveryField = invoice.deliveryDetail || invoice.invoiceDelivery;
      if (deliveryField) {
        invoice.deliveryAddress = deliveryField.address || "";
        invoice.deliveryReceiver = deliveryField.receiver || "";
        invoice.deliveryContactNumber = deliveryField.contactNumber || "";

        invoiceDeliveryCollection.push({
          invoiceId: invoice.id,
          invoiceCode: invoice.code,
          ...deliveryField,
        });

        delete invoice.deliveryDetail;
        delete invoice.invoiceDelivery;
      }

      // Xử lý payments
      if (invoice.payments && Array.isArray(invoice.payments)) {
        invoice.payments.forEach((payment) => {
          invoicePaymentsCollection.push({
            invoiceId: invoice.id,
            invoiceCode: invoice.code,
            ...payment,
          });
        });

        invoice.paymentCount = invoice.payments.length;

        delete invoice.payments;
      }

      // Xử lý surcharges
      if (
        invoice.invoiceOrderSurcharges &&
        Array.isArray(invoice.invoiceOrderSurcharges)
      ) {
        invoice.invoiceOrderSurcharges.forEach((surcharge) => {
          invoiceSurchargesCollection.push({
            invoiceId: invoice.id,
            invoiceCode: invoice.code,
            ...surcharge,
          });
        });

        delete invoice.invoiceOrderSurcharges;
      }
    });

    // Tạo worksheet cho hóa đơn chính
    const mainWorksheet = XLSX.utils.json_to_sheet(flattenedInvoices);
    XLSX.utils.book_append_sheet(workbook, mainWorksheet, "Invoices");

    // Tạo các sheet bổ sung nếu có dữ liệu
    if (invoiceDetailsCollection.length > 0) {
      const detailsWorksheet = XLSX.utils.json_to_sheet(
        invoiceDetailsCollection
      );
      XLSX.utils.book_append_sheet(
        workbook,
        detailsWorksheet,
        "InvoiceDetails"
      );
    }

    if (invoiceDeliveryCollection.length > 0) {
      const deliveryWorksheet = XLSX.utils.json_to_sheet(
        invoiceDeliveryCollection
      );
      XLSX.utils.book_append_sheet(
        workbook,
        deliveryWorksheet,
        "InvoiceDelivery"
      );
    }

    if (invoicePaymentsCollection.length > 0) {
      const paymentsWorksheet = XLSX.utils.json_to_sheet(
        invoicePaymentsCollection
      );
      XLSX.utils.book_append_sheet(
        workbook,
        paymentsWorksheet,
        "InvoicePayments"
      );
    }

    if (invoiceSurchargesCollection.length > 0) {
      const surchargesWorksheet = XLSX.utils.json_to_sheet(
        invoiceSurchargesCollection
      );
      XLSX.utils.book_append_sheet(
        workbook,
        surchargesWorksheet,
        "InvoiceSurcharges"
      );
    }

    // Ghi workbook ra file Excel
    XLSX.writeFile(workbook, INVOICES_EXCEL_PATH);

    console.log(
      `Successfully converted invoices to Excel: ${INVOICES_EXCEL_PATH}`
    );
    return true;
  } catch (error) {
    console.error("Error converting invoices to Excel:", error);
    return false;
  }
}

function convertProductsToExcel() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE_PATH)) {
      console.log("Products file does not exist, skipping conversion");
      return false;
    }

    const productsData = JSON.parse(
      fs.readFileSync(PRODUCTS_FILE_PATH, "utf8")
    );

    if (
      !productsData.products ||
      !Array.isArray(productsData.products) ||
      productsData.products.length === 0
    ) {
      console.log("No products data to convert");
      return false;
    }

    const workbook = XLSX.utils.book_new();

    // Tạo bản sao sâu của dữ liệu
    const flattenedProducts = JSON.parse(JSON.stringify(productsData.products));

    // Thu thập các trường mở rộng để tạo sheet riêng
    const productAttributesCollection = [];
    const productInventoriesCollection = [];
    const productUnitsCollection = [];
    const productPriceBooksCollection = [];
    const productSerialsCollection = [];
    const productBatchExpiresCollection = [];

    // Bảng ánh xạ tên cột tiếng Anh - tiếng Việt
    const fieldMappings = {
      // Sheet chính - Sản phẩm
      id: "ID",
      code: "Mã sản phẩm",
      barCode: "Mã vạch",
      name: "Tên sản phẩm",
      fullName: "Tên đầy đủ",
      categoryId: "ID Danh mục",
      categoryName: "Tên danh mục",
      tradeMarkId: "ID Thương hiệu",
      tradeMarkName: "Tên thương hiệu",
      allowsSale: "Cho phép bán",
      type: "Loại hàng",
      hasVariants: "Có biến thể",
      basePrice: "Giá bán",
      weight: "Trọng lượng",
      unit: "Đơn vị tính",
      conversionValue: "Giá trị quy đổi",
      modifiedDate: "Ngày cập nhật",
      createdDate: "Ngày tạo",
      isActive: "Đang hoạt động",
      isLotSerialControl: "Quản lý theo serial/IMEI",
      isBatchExpireControl: "Quản lý theo lô/HSD",
      totalOnHand: "Tổng tồn kho",
      unitsList: "Danh sách đơn vị tính",
      attributesList: "Danh sách thuộc tính",
      imagesList: "Danh sách hình ảnh",
      serialCount: "Số lượng serial",
      batchCount: "Số lượng lô",

      // Sheet tồn kho
      productId: "ID Sản phẩm",
      productCode: "Mã sản phẩm",
      productName: "Tên sản phẩm",
      branchId: "ID Chi nhánh",
      branchName: "Tên chi nhánh",
      cost: "Giá vốn",
      onHand: "Tồn kho",
      reserved: "Đã đặt",
      minQuantity: "Tồn kho tối thiểu",
      maxQuantity: "Tồn kho tối đa",
      onOrder: "Đặt từ nhà cung cấp",

      // Sheet bảng giá
      priceBookId: "ID Bảng giá",
      priceBookName: "Tên bảng giá",
      price: "Giá bán",
      startDate: "Ngày bắt đầu",
      endDate: "Ngày kết thúc",

      // Sheet thuộc tính
      attributeName: "Tên thuộc tính",
      attributeValue: "Giá trị thuộc tính",

      // Sheet đơn vị tính
      id: "ID",
      name: "Tên",
    };

    const booleanFields = [
      "isActive",
      "allowsSale",
      "hasVariants",
      "isLotSerialControl",
      "isBatchExpireControl",
      "isRewardPoint",
      "forAllCusGroup",
      "forAllUser",
    ];

    // Làm phẳng dữ liệu và thu thập các chi tiết
    flattenedProducts.forEach((product) => {
      for (const field of booleanFields) {
        if (product[field] !== undefined) {
          product[field] = product[field] === true ? "Có" : "Không";
        }
      }
      // Xử lý attributes
      if (product.attributes && Array.isArray(product.attributes)) {
        product.attributes.forEach((attr) => {
          productAttributesCollection.push({
            productId: product.id,
            productCode: product.code,
            ...attr,
          });
        });

        // Thêm các trường hữu ích vào sản phẩm chính
        if (product.attributes.length > 0) {
          product.attributesList = product.attributes
            .map((a) => `${a.attributeName}: ${a.attributeValue}`)
            .join(", ");
        }

        delete product.attributes;
      }

      // Xử lý inventories
      if (product.inventories && Array.isArray(product.inventories)) {
        product.inventories.forEach((inventory) => {
          productInventoriesCollection.push({
            productId: product.id,
            productCode: product.code,
            ...inventory,
          });
        });

        // Tính tổng tồn kho trên tất cả chi nhánh
        if (product.inventories.length > 0) {
          product.totalOnHand = product.inventories.reduce(
            (sum, inv) => sum + (inv.onHand || 0),
            0
          );
        }

        delete product.inventories;
      }

      // Xử lý units
      if (product.units && Array.isArray(product.units)) {
        product.units.forEach((unit) => {
          productUnitsCollection.push({
            productId: product.id,
            productCode: product.code,
            ...unit,
          });
        });

        if (product.units.length > 0) {
          product.unitsList = product.units
            .map((u) => `${u.name} (${u.conversionValue})`)
            .join(", ");
        }

        delete product.units;
      }

      // Xử lý priceBooks
      if (product.priceBooks && Array.isArray(product.priceBooks)) {
        product.priceBooks.forEach((priceBook) => {
          productPriceBooksCollection.push({
            productId: product.id,
            productCode: product.code,
            ...priceBook,
          });
        });

        delete product.priceBooks;
      }

      // Xử lý productSerials
      if (product.productSerials && Array.isArray(product.productSerials)) {
        product.productSerials.forEach((serial) => {
          productSerialsCollection.push({
            productId: product.id,
            productCode: product.code,
            ...serial,
          });
        });

        product.serialCount = product.productSerials.length;

        delete product.productSerials;
      }

      // Xử lý productBatchExpires
      if (
        product.productBatchExpires &&
        Array.isArray(product.productBatchExpires)
      ) {
        product.productBatchExpires.forEach((batch) => {
          productBatchExpiresCollection.push({
            productId: product.id,
            productCode: product.code,
            ...batch,
          });
        });

        product.batchCount = product.productBatchExpires.length;

        delete product.productBatchExpires;
      }

      // Xử lý images để chuyển từ mảng sang chuỗi
      if (product.images && Array.isArray(product.images)) {
        if (product.images.length > 0) {
          product.imagesList = product.images
            .map((img) =>
              typeof img === "object" && img.Image ? img.Image : img
            )
            .join(", ");
        }

        delete product.images;
      }
    });

    // Hàm tạo worksheet với tiêu đề tiếng Việt
    function createWorksheetWithVietnameseHeaders(data, sheetName) {
      // Tạo worksheet từ dữ liệu
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Lấy các tiêu đề hiện tại
      const headers = [];
      const range = XLSX.utils.decode_range(worksheet["!ref"]);

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (cell && cell.v) headers.push(cell.v);
      }

      // Thay đổi tiêu đề sang tiếng Việt
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (headerCell && headerCell.v && fieldMappings[headerCell.v]) {
          headerCell.v = fieldMappings[headerCell.v];
        }
      }

      return worksheet;
    }

    // Tạo worksheet cho sản phẩm chính
    const mainWorksheet = createWorksheetWithVietnameseHeaders(
      flattenedProducts,
      "Products"
    );
    XLSX.utils.book_append_sheet(workbook, mainWorksheet, "Sản phẩm");

    // Tạo các sheet bổ sung nếu có dữ liệu
    if (productAttributesCollection.length > 0) {
      const attributesWorksheet = createWorksheetWithVietnameseHeaders(
        productAttributesCollection,
        "ProductAttributes"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        attributesWorksheet,
        "Thuộc tính SP"
      );
    }

    if (productInventoriesCollection.length > 0) {
      const inventoriesWorksheet = createWorksheetWithVietnameseHeaders(
        productInventoriesCollection,
        "ProductInventories"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        inventoriesWorksheet,
        "Tồn kho SP"
      );
    }

    if (productUnitsCollection.length > 0) {
      const unitsWorksheet = createWorksheetWithVietnameseHeaders(
        productUnitsCollection,
        "ProductUnits"
      );
      XLSX.utils.book_append_sheet(workbook, unitsWorksheet, "Đơn vị tính SP");
    }

    if (productPriceBooksCollection.length > 0) {
      const priceBooksWorksheet = createWorksheetWithVietnameseHeaders(
        productPriceBooksCollection,
        "ProductPriceBooks"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        priceBooksWorksheet,
        "Bảng giá SP"
      );
    }

    if (productSerialsCollection.length > 0) {
      const serialsWorksheet = createWorksheetWithVietnameseHeaders(
        productSerialsCollection,
        "ProductSerials"
      );
      XLSX.utils.book_append_sheet(
        workbook,
        serialsWorksheet,
        "Serial/IMEI SP"
      );
    }

    if (productBatchExpiresCollection.length > 0) {
      const batchesWorksheet = createWorksheetWithVietnameseHeaders(
        productBatchExpiresCollection,
        "ProductBatches"
      );
      XLSX.utils.book_append_sheet(workbook, batchesWorksheet, "Lô/HSD SP");
    }

    // Ghi workbook ra file Excel
    XLSX.writeFile(workbook, PRODUCTS_EXCEL_PATH);

    console.log(
      `Successfully converted products to Excel: ${PRODUCTS_EXCEL_PATH}`
    );
    return true;
  } catch (error) {
    console.error("Error converting products to Excel:", error);
    return false;
  }
}

function convertAllToExcel() {
  console.log("Starting conversion of all JSON files to Excel...");

  const ordersResult = convertOrdersToExcel();
  const invoicesResult = convertInvoicesToExcel();
  const productsResult = convertProductsToExcel();

  console.log(
    `Conversion complete: Orders: ${ordersResult}, Invoices: ${invoicesResult}, Products: ${productsResult}`
  );

  return {
    orders: ordersResult,
    invoices: invoicesResult,
    products: productsResult,
  };
}

function startScheduler(intervalSeconds = 15, initialScanDays = 1) {
  console.log(
    `Starting order scanner - initial scan: ${initialScanDays} days, then every ${intervalSeconds} seconds for today's data`
  );

  console.log(
    `Starting invoice scanner - initial scan: ${initialScanDays} days, then every ${intervalSeconds} seconds for today's data`
  );

  console.log(
    `Starting products scanner - initial scan: ${initialScanDays} days, then every ${intervalSeconds} seconds for today's data`
  );

  const progress = loadScanProgress();
  const today = formatDate(new Date());

  if (
    !progress.lastScannedDate ||
    new Date(progress.lastScannedDate) < new Date(today)
  ) {
    console.log("Starting initial historical data scan...");

    scanOrdersForDays(initialScanDays).then(() => {
      console.log(
        "Initial scan for orders completed, switching to incremental updates"
      );

      setInterval(() => {
        scanRecentOrders();
      }, intervalSeconds * 1000);
    });

    scanInvoicesForDays(initialScanDays).then(() => {
      console.log(
        "Initial scan for invoices completed, switching to incremental updates"
      );

      setInterval(() => {
        scanRecentInvoices();
      }, intervalSeconds * 1500);
    });

    scanProductsForDays(initialScanDays).then(() => {
      console.log(
        "Initial scan for products completed, switching to incremental updates"
      );

      setInterval(() => {
        scanRecentProducts();
      }, intervalSeconds * 1800);
    });
  } else {
    console.log(
      "Historical data already scanned, starting incremental updates"
    );
    scanRecentOrders();
    scanRecentInvoices();
    scanRecentProducts();

    setInterval(() => {
      scanRecentOrders();
      scanRecentInvoices();
      scanRecentProducts();
    }, intervalSeconds * 1000);
  }
}

function scheduleExcelConversion(intervalMinutes = 60) {
  console.log(`Scheduling Excel conversion every ${intervalMinutes} minutes`);

  convertAllToExcel();

  setInterval(() => {
    console.log(
      `Running scheduled Excel conversion at ${new Date().toISOString()}`
    );
    convertAllToExcel();
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  startScheduler,
  scanOrdersForDays,
  scanInvoicesForDays,
  scanRecentInvoices,
  convertOrdersToExcel,
  convertInvoicesToExcel,
  convertProductsToExcel,
  convertAllToExcel,
  scheduleExcelConversion,
};
