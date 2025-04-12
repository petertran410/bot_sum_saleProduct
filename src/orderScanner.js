// src/orderScanner.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const kiotviet = require("./kiotviet");

// Định nghĩa đường dẫn file để lưu đơn hàng
const ORDERS_FILE_PATH = path.resolve(process.cwd(), "lastOrders.json");
const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;

async function getRecentOrders() {
  try {
    const token = await kiotviet.getToken();

    // Tính toán ngày trước đó 7 ngày
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);

    // Lấy ngày hiện tại
    const currentDate = new Date();

    // Khởi tạo biến
    let allOrders = [];
    const pageSize = 100;

    console.log(
      `🔍 Bắt đầu lấy đơn hàng từ ${sevenDaysAgo.toLocaleDateString()} đến ${currentDate.toLocaleDateString()}`
    );

    // Lặp qua từng ngày để đảm bảo lấy đủ dữ liệu
    for (
      let date = new Date(sevenDaysAgo);
      date <= currentDate;
      date.setDate(date.getDate() + 1)
    ) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      console.log(`🔍 Lấy đơn hàng cho ngày ${startDate.toLocaleDateString()}`);

      // Biến cho phân trang trong ngày hiện tại
      let currentItem = 0;
      let hasMoreData = true;
      let dayOrders = [];

      // Lấy tất cả các trang cho ngày hiện tại
      while (hasMoreData) {
        const response = await axios.get("https://public.kiotapi.com/orders", {
          params: {
            status: [1, 3],
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "createdDate",
            orderDirection: "DESC",
            includePayment: true,
            includeOrderDelivery: true,
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        });

        const orders = response.data.data || [];
        dayOrders = dayOrders.concat(orders);

        console.log(
          `📊 Lấy được ${
            orders.length
          } đơn hàng cho ${startDate.toLocaleDateString()}, tổng số trong ngày: ${
            dayOrders.length
          }`
        );

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

      // Thêm đơn hàng của ngày vào tổng hợp
      allOrders = allOrders.concat(dayOrders);
      console.log(
        `✅ Hoàn thành lấy đơn hàng cho ${startDate.toLocaleDateString()}, tổng số đơn hàng đến hiện tại: ${
          allOrders.length
        }`
      );

      // Đợi một chút trước khi chuyển sang ngày tiếp theo để tránh giới hạn tốc độ API
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
      `🔄 Đã loại bỏ ${
        allOrders.length - uniqueOrders.length
      } đơn hàng trùng lặp`
    );
    console.log(`✅ Tổng số đơn hàng duy nhất: ${uniqueOrders.length}`);

    return uniqueOrders;
  } catch (error) {
    console.error("❌ Lỗi khi lấy đơn hàng gần đây:", error.message);
    if (error.response) {
      console.error("Lỗi API:", error.response.status, error.response.data);
    }
    throw error;
  }
}

function saveCurrentOrders(orders) {
  try {
    if (!orders || !Array.isArray(orders)) {
      console.error("Invalid orders data");
      return;
    }

    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(ORDERS_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Thêm timestamp khi lưu
    const dataToSave = {
      timestamp: new Date().toISOString(),
      orders: orders,
    };

    // Ghi file
    fs.writeFileSync(
      ORDERS_FILE_PATH,
      JSON.stringify(dataToSave, null, 2),
      "utf8"
    );
    console.log(`Đã lưu thành công ${orders.length} đơn hàng vào file`);
  } catch (error) {
    console.error("Lỗi khi lưu đơn hàng hiện tại:", error.message);
  }
}

function getSavedOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = fs.readFileSync(ORDERS_FILE_PATH, "utf8");
      if (!data || data.trim() === "") {
        return { orders: [] };
      }

      try {
        const parsedData = JSON.parse(data);
        return parsedData;
      } catch (parseError) {
        console.error(
          "Lỗi khi phân tích dữ liệu đơn hàng:",
          parseError.message
        );
        return { orders: [] };
      }
    }
    console.log("Không tìm thấy file dữ liệu đơn hàng, tạo mới");
    return { orders: [] };
  } catch (error) {
    console.error("Lỗi khi đọc dữ liệu đơn hàng:", error.message);
    return { orders: [] };
  }
}

// Hàm so sánh danh sách đơn hàng để tìm đơn hàng mới hoặc cập nhật
function findNewOrUpdatedOrders(currentOrders, savedOrders) {
  if (
    !savedOrders ||
    !savedOrders.orders ||
    !Array.isArray(savedOrders.orders)
  ) {
    return currentOrders;
  }

  const savedOrderMap = new Map();
  savedOrders.orders.forEach((order) => {
    if (order && order.id) {
      savedOrderMap.set(order.id, order);
    }
  });

  const newOrders = [];
  const updatedOrders = [];

  for (const currentOrder of currentOrders) {
    if (!currentOrder || !currentOrder.id) continue;

    const savedOrder = savedOrderMap.get(currentOrder.id);

    if (!savedOrder) {
      // Đơn hàng mới
      newOrders.push({ ...currentOrder, changeType: "new" });
    } else if (savedOrder.modifiedDate !== currentOrder.modifiedDate) {
      // Đơn hàng cập nhật
      updatedOrders.push({ ...currentOrder, changeType: "updated" });
    }
  }

  console.log(
    `Tìm thấy ${newOrders.length} đơn hàng mới và ${updatedOrders.length} đơn hàng cập nhật`
  );
  return [...newOrders, ...updatedOrders];
}

async function setupOrderScanner() {
  console.log("Thiết lập quét đơn hàng tự động mỗi 15 giây");

  const interval = setInterval(async () => {
    try {
      console.log(
        `\n--- Quét đơn hàng lúc ${new Date().toLocaleTimeString()} ---`
      );

      // Lấy danh sách đơn hàng hiện tại
      const currentOrders = await getRecentOrders();
      console.log(`Lấy được ${currentOrders.length} đơn hàng từ KiotViet`);

      // Lấy danh sách đơn hàng đã lưu trước đó
      const savedOrdersData = getSavedOrders();

      // Tìm đơn hàng mới hoặc đã cập nhật
      const changedOrders = findNewOrUpdatedOrders(
        currentOrders,
        savedOrdersData
      );

      if (changedOrders.length > 0) {
        console.log(
          `Phát hiện ${changedOrders.length} đơn hàng mới hoặc đã cập nhật`
        );

        // Có thể thêm xử lý thông báo hoặc các hành động khác ở đây
        // Ví dụ: gửi thông báo qua email, webhook, v.v.
      } else {
        console.log("Không có đơn hàng mới hoặc cập nhật");
      }

      // Lưu danh sách đơn hàng hiện tại vào file
      saveCurrentOrders(currentOrders);
    } catch (error) {
      console.error("Lỗi trong quá trình quét đơn hàng:", error.message);
    }
  }, 15000);

  return {
    stop: () => clearInterval(interval),
  };
}

module.exports = {
  setupOrderScanner,
  getRecentOrders,
  saveCurrentOrders,
  getSavedOrders,
  findNewOrUpdatedOrders,
};
