// // const db = require("../db-mongo.js");

// // const getOldData = db.getOldData;
// // const saveCurrentData = db.saveCurrentData;

// const axios = require("axios");
// const schedule = require("node-schedule");
// const kiotviet = require("./kiotviet");
// const lark = require("./lark");
// const path = require("path");
// const fs = require("fs");

// function setupPeriodicCheck() {
//   console.log("Webhook mode enabled. Periodic polling disabled.");

//   // Tạo một đối tượng giả để duy trì API
//   return {
//     stop: () => console.log("Webhook mode - no polling to stop"),
//     updateWebhookReceived: () => console.log("Webhook received at", new Date()),
//   };
// }

// // Thêm hàm này để index.js có thể gọi
// function updateWebhookReceived() {
//   console.log(`Webhook received at ${new Date().toISOString()}`);
//   // Có thể thêm mã ghi log hoặc thông báo ở đây
// }

// async function getOrdersModifiedToday() {
//   try {
//     const token = await kiotviet.getToken();

//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const todayStr = today.toISOString();

//     // 154833 (Kho Hà Nội)
//     const branchIds = [635934, 402819, 154833];

//     // const allowedSoldByNames = [
//     //   "Tô Quang Duy",
//     //   "Phạm Thị Hà Nhi",
//     //   "Bàng Anh Vũ",
//     // ];

//     const response = await axios.get(`${process.env.KIOT_BASE_URL}/orders`, {
//       params: {
//         lastModifiedFrom: todayStr,
//         pageSize: 200,
//         orderBy: "modifiedDate",
//         orderDirection: "DESC",
//         branchIds: branchIds.join(","),
//       },
//       headers: {
//         Retailer: process.env.KIOT_SHOP_NAME,
//         Authorization: `Bearer ${token}`,
//       },
//     });

//     // lọc theo branchId
//     const orders = response.data.data || [];
//     console.log(
//       `Retrieved ${
//         orders.length
//       } orders modified today from branches: ${branchIds.join(", ")}`
//     );

//     // return filteredOrders;
//     return orders;
//   } catch (error) {
//     console.error("Error getting orders modified today:", error.message);
//     throw error;
//   }
// }

// function findChangedOrders(currentOrders, oldOrders) {
//   console.log(
//     `Comparing ${currentOrders.length} current orders with ${
//       oldOrders?.length || 0
//     } old orders`
//   );

//   if (!oldOrders || oldOrders.length === 0) {
//     console.log("No old orders for comparison, treating all as new");
//     // Lọc chỉ đơn ở trạng thái "Hoàn thành" hoặc "Đã hủy"
//     const filteredNew = currentOrders.filter(
//       (order) => order.status === 3 || order.status === 4
//     );
//     console.log(
//       `Filtered ${filteredNew.length} orders with status "Completed" or "Cancelled" from ${currentOrders.length} new orders`
//     );
//     return filteredNew.map((order) => ({ ...order, changeType: "new" }));
//   }

//   // Tạo map từ danh sách đơn hàng cũ để tra cứu nhanh
//   const oldOrdersMap = new Map();
//   oldOrders.forEach((order) => {
//     oldOrdersMap.set(order.code, order);
//   });

//   // Danh sách đơn hàng thay đổi
//   const changedOrders = [];

//   for (const currentOrder of currentOrders) {
//     const oldOrder = oldOrdersMap.get(currentOrder.code);

//     // Kiểm tra đơn hàng đã tồn tại hay chưa
//     if (oldOrder) {
//       // Đơn hàng đã tồn tại - Kiểm tra xem có thay đổi không
//       const statusChanged = currentOrder.status !== oldOrder.status;
//       const totalChanged = currentOrder.total !== oldOrder.total;
//       const modifiedDateChanged =
//         currentOrder.modifiedDate !== oldOrder.modifiedDate;

//       // So sánh thông tin chi tiết sản phẩm
//       let detailsChanged = false;
//       if (currentOrder.orderDetails && oldOrder.orderDetails) {
//         // So sánh số lượng sản phẩm
//         if (currentOrder.orderDetails.length !== oldOrder.orderDetails.length) {
//           detailsChanged = true;
//         } else {
//           // So sánh từng sản phẩm
//           for (let i = 0; i < currentOrder.orderDetails.length; i++) {
//             const currentDetail = currentOrder.orderDetails[i];
//             const oldDetail = oldOrder.orderDetails[i];

//             if (
//               currentDetail.productId !== oldDetail.productId ||
//               currentDetail.quantity !== oldDetail.quantity ||
//               currentDetail.price !== oldDetail.price
//             ) {
//               detailsChanged = true;
//               break;
//             }
//           }
//         }
//       }

//       // Nếu có bất kỳ thay đổi nào và đơn hàng ở trạng thái "Hoàn thành" hoặc "Đã hủy"
//       if (
//         (statusChanged ||
//           totalChanged ||
//           modifiedDateChanged ||
//           detailsChanged) &&
//         (currentOrder.status === 3 || currentOrder.status === 4)
//       ) {
//         console.log(
//           `Modified order detected: ${currentOrder.code} (Status: ${currentOrder.statusValue})`
//         );
//         changedOrders.push({ ...currentOrder, changeType: "modified" });
//       }
//     } else {
//       // Đơn hàng chưa tồn tại trong dữ liệu cũ và đơn hàng ở trạng thái "Hoàn thành" hoặc "Đã hủy"
//       if (currentOrder.status === 3 || currentOrder.status === 4) {
//         console.log(
//           `New order detected: ${currentOrder.code} (Status: ${currentOrder.statusValue})`
//         );
//         changedOrders.push({ ...currentOrder, changeType: "new" });
//       }
//     }
//   }

//   console.log(
//     `Found ${
//       changedOrders.length
//     } changed orders with status "Completed" or "Cancelled" (${
//       changedOrders.filter((o) => o.changeType === "new").length
//     } new, ${
//       changedOrders.filter((o) => o.changeType === "modified").length
//     } modified)`
//   );
//   return changedOrders;
// }

// function saveCurrentData(orders) {
//   try {
//     // Kiểm tra nếu orders là null hoặc undefined
//     if (!orders) {
//       console.error("Cannot save null or undefined orders data");
//       return;
//     }

//     // Kiểm tra nếu orders không phải là một mảng
//     if (!Array.isArray(orders)) {
//       console.error("Orders data is not an array, attempting to save anyway");
//     }

//     // Sử dụng đường dẫn tuyệt đối thay vì tương đối
//     const filePath = path.resolve(process.cwd(), "lastOrders.json");

//     // Log thông tin chi tiết hơn
//     console.log(`Saving ${orders.length || 0} orders to ${filePath}`);

//     // Đảm bảo thư mục tồn tại
//     const dirPath = path.dirname(filePath);
//     if (!fs.existsSync(dirPath)) {
//       fs.mkdirSync(dirPath, { recursive: true });
//     }

//     // Ghi file
//     fs.writeFileSync(filePath, JSON.stringify(orders, null, 2), "utf8");

//     console.log(`Successfully saved orders data`);
//   } catch (error) {
//     console.error("Error saving current data:", error.message);
//     // Log thêm thông tin để debug
//     console.error("Error stack:", error.stack);
//   }
// }

// function getOldData() {
//   try {
//     if (fs.existsSync("./lastOrders.json")) {
//       const data = fs.readFileSync("./lastOrders.json", "utf8");
//       if (!data || data.trim() === "") {
//         console.log("Empty data file, returning empty array");
//         return [];
//       }

//       const orders = JSON.parse(data);
//       console.log(`Read ${orders.length} orders from lastOrders.json`);
//       return orders;
//     }
//     console.log("No existing data file, returning empty array");
//     return [];
//   } catch (error) {
//     console.error("Error reading old data:", error.message);
//     // Nếu có lỗi, xóa file để tạo mới trong lần sau
//     try {
//       if (fs.existsSync("./lastOrders.json")) {
//         fs.unlinkSync("./lastOrders.json");
//         console.log("Removed corrupted data file");
//       }
//     } catch (e) {
//       console.error("Failed to remove corrupted data file:", e.message);
//     }
//     return [];
//   }
// }

// function findNewOrders(currentOrders, oldOrders) {
//   if (!oldOrders || oldOrders.length === 0) return currentOrders;

//   const oldOrderCodes = new Set(oldOrders.map((order) => order.code));

//   return currentOrders.filter((order) => !oldOrderCodes.has(order.code));
// }

// module.exports = {
//   setupPeriodicCheck,
// };

// const db = require("../db-mongo.js");

// const getOldData = db.getOldData;
// const saveCurrentData = db.saveCurrentData;

const axios = require("axios");
const schedule = require("node-schedule");
const kiotviet = require("./kiotviet");
const lark = require("./lark");
const path = require("path");
const fs = require("fs");

function setupPeriodicCheck() {
  console.log(
    "Setting up periodic check every 15 seconds for orders changed today"
  );

  const interval = setInterval(async () => {
    try {
      console.log(
        `\n--- Periodic check at ${new Date().toLocaleTimeString()} ---`
      );

      const modifiedOrders = await getOrdersModifiedToday();

      const oldData = getOldData();

      const changedOrders = findChangedOrders(modifiedOrders, oldData);

      const completedOrCancelledOrders = changedOrders.filter(
        (order) =>
          order.changeType === "modified" &&
          (order.status === 3 || order.status === 4)
      );

      // Chỉ gửi thông báo về các đơn đã thay đổi với trạng thái "Hoàn thành" hoặc "Đã hủy"
      if (completedOrCancelledOrders.length > 0) {
        console.log(
          `Found ${completedOrCancelledOrders.length} modified orders with status "Completed" or "Cancelled"`
        );

        for (const order of completedOrCancelledOrders) {
          console.log(`- Modified order: ${order.code} (${order.statusValue})`);
          try {
            await lark.sendSingleOrderReport(order);
            console.log(
              `  Notification sent for modified order: ${order.code}`
            );
          } catch (err) {
            console.error(
              `  Error sending notification for order ${order.code}:`,
              err.message
            );
          }
        }
      } else {
        console.log("No completed/cancelled modified orders detected");
      }

      saveCurrentData(modifiedOrders);
    } catch (error) {
      console.error("Error in periodic check:", error.message);
    }
  }, 15000);

  return {
    stop: () => clearInterval(interval),
  };
}

async function getOrdersModifiedToday() {
  try {
    const token = await kiotviet.getToken();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // 154833 (Kho Hà Nội)
    const branchIds = [635934, 402819, 154833];

    // const allowedSoldByNames = [
    //   "Tô Quang Duy",
    //   "Phạm Thị Hà Nhi",
    //   "Bàng Anh Vũ",
    // ];

    const response = await axios.get(`${process.env.KIOT_BASE_URL}/orders`, {
      params: {
        lastModifiedFrom: todayStr,
        pageSize: 200,
        orderBy: "modifiedDate",
        orderDirection: "DESC",
        branchIds: branchIds.join(","),
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    // Lọc đơn hàng theo tên người bán
    // const allOrders = response.data.data || [];
    // const filteredOrders = allOrders.filter(
    //   (order) =>
    //     order.soldByName && allowedSoldByNames.includes(order.soldByName)
    // );
    // console.log(
    //   `Retrieved ${allOrders.length} orders, filtered to ${
    //     filteredOrders.length
    //   } orders from sellers: ${allowedSoldByNames.join(", ")}`
    // );

    // lọc theo branchId
    const orders = response.data.data || [];
    console.log(
      `Retrieved ${
        orders.length
      } orders modified today from branches: ${branchIds.join(", ")}`
    );

    // return filteredOrders;
    return orders;
  } catch (error) {
    console.error("Error getting orders modified today:", error.message);
    throw error;
  }
}

function findChangedOrders(currentOrders, oldOrders) {
  console.log(
    `Comparing ${currentOrders.length} current orders with ${
      oldOrders?.length || 0
    } old orders`
  );

  if (!oldOrders || oldOrders.length === 0) {
    console.log("No old orders for comparison, treating all as new");
    // Lọc chỉ đơn ở trạng thái "Hoàn thành" hoặc "Đã hủy"
    const filteredNew = currentOrders.filter(
      (order) => order.status === 3 || order.status === 4
    );
    console.log(
      `Filtered ${filteredNew.length} orders with status "Completed" or "Cancelled" from ${currentOrders.length} new orders`
    );
    return filteredNew.map((order) => ({ ...order, changeType: "new" }));
  }

  // Tạo map từ danh sách đơn hàng cũ để tra cứu nhanh
  const oldOrdersMap = new Map();
  oldOrders.forEach((order) => {
    oldOrdersMap.set(order.code, order);
  });

  // Danh sách đơn hàng thay đổi
  const changedOrders = [];

  for (const currentOrder of currentOrders) {
    const oldOrder = oldOrdersMap.get(currentOrder.code);

    // Kiểm tra đơn hàng đã tồn tại hay chưa
    if (oldOrder) {
      // Đơn hàng đã tồn tại - Kiểm tra xem có thay đổi không
      const statusChanged = currentOrder.status !== oldOrder.status;
      const totalChanged = currentOrder.total !== oldOrder.total;
      const modifiedDateChanged =
        currentOrder.modifiedDate !== oldOrder.modifiedDate;

      // So sánh thông tin chi tiết sản phẩm
      let detailsChanged = false;
      if (currentOrder.orderDetails && oldOrder.orderDetails) {
        // So sánh số lượng sản phẩm
        if (currentOrder.orderDetails.length !== oldOrder.orderDetails.length) {
          detailsChanged = true;
        } else {
          // So sánh từng sản phẩm
          for (let i = 0; i < currentOrder.orderDetails.length; i++) {
            const currentDetail = currentOrder.orderDetails[i];
            const oldDetail = oldOrder.orderDetails[i];

            if (
              currentDetail.productId !== oldDetail.productId ||
              currentDetail.quantity !== oldDetail.quantity ||
              currentDetail.price !== oldDetail.price
            ) {
              detailsChanged = true;
              break;
            }
          }
        }
      }

      // Nếu có bất kỳ thay đổi nào và đơn hàng ở trạng thái "Hoàn thành" hoặc "Đã hủy"
      if (
        (statusChanged ||
          totalChanged ||
          modifiedDateChanged ||
          detailsChanged) &&
        (currentOrder.status === 3 || currentOrder.status === 4)
      ) {
        console.log(
          `Modified order detected: ${currentOrder.code} (Status: ${currentOrder.statusValue})`
        );
        changedOrders.push({ ...currentOrder, changeType: "modified" });
      }
    } else {
      // Đơn hàng chưa tồn tại trong dữ liệu cũ và đơn hàng ở trạng thái "Hoàn thành" hoặc "Đã hủy"
      if (currentOrder.status === 3 || currentOrder.status === 4) {
        console.log(
          `New order detected: ${currentOrder.code} (Status: ${currentOrder.statusValue})`
        );
        changedOrders.push({ ...currentOrder, changeType: "new" });
      }
    }
  }

  console.log(
    `Found ${
      changedOrders.length
    } changed orders with status "Completed" or "Cancelled" (${
      changedOrders.filter((o) => o.changeType === "new").length
    } new, ${
      changedOrders.filter((o) => o.changeType === "modified").length
    } modified)`
  );
  return changedOrders;
}

function saveCurrentData(orders) {
  try {
    // Kiểm tra nếu orders là null hoặc undefined
    if (!orders) {
      console.error("Cannot save null or undefined orders data");
      return;
    }

    // Kiểm tra nếu orders không phải là một mảng
    if (!Array.isArray(orders)) {
      console.error("Orders data is not an array, attempting to save anyway");
    }

    // Sử dụng đường dẫn tuyệt đối thay vì tương đối
    const filePath = path.resolve(process.cwd(), "lastOrders.json");

    // Log thông tin chi tiết hơn
    console.log(`Saving ${orders.length || 0} orders to ${filePath}`);

    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Ghi file
    fs.writeFileSync(filePath, JSON.stringify(orders, null, 2), "utf8");

    console.log(`Successfully saved orders data`);
  } catch (error) {
    console.error("Error saving current data:", error.message);
    // Log thêm thông tin để debug
    console.error("Error stack:", error.stack);
  }
}

function getOldData() {
  try {
    if (fs.existsSync("./lastOrders.json")) {
      const data = fs.readFileSync("./lastOrders.json", "utf8");
      if (!data || data.trim() === "") {
        console.log("Empty data file, returning empty array");
        return [];
      }

      const orders = JSON.parse(data);
      console.log(`Read ${orders.length} orders from lastOrders.json`);
      return orders;
    }
    console.log("No existing data file, returning empty array");
    return [];
  } catch (error) {
    console.error("Error reading old data:", error.message);
    // Nếu có lỗi, xóa file để tạo mới trong lần sau
    try {
      if (fs.existsSync("./lastOrders.json")) {
        fs.unlinkSync("./lastOrders.json");
        console.log("Removed corrupted data file");
      }
    } catch (e) {
      console.error("Failed to remove corrupted data file:", e.message);
    }
    return [];
  }
}

function findNewOrders(currentOrders, oldOrders) {
  if (!oldOrders || oldOrders.length === 0) return currentOrders;

  const oldOrderCodes = new Set(oldOrders.map((order) => order.code));

  return currentOrders.filter((order) => !oldOrderCodes.has(order.code));
}

module.exports = {
  setupPeriodicCheck,
};
