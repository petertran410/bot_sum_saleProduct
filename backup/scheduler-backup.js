const axios = require("axios");
const kiotviet = require("./kiotviet");
const lark = require("./lark");
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
    return currentOrders.map((order) => ({ ...order, changeType: "new" }));
  }

  const oldOrdersMap = new Map();
  oldOrders.forEach((order) => {
    oldOrdersMap.set(order.code, order);
  });

  const changedOrders = [];

  for (const currentOrder of currentOrders) {
    const oldOrder = oldOrdersMap.get(currentOrder.code);

    if (oldOrder) {
      const statusChanged = currentOrder.status !== oldOrder.status;
      const totalChanged = currentOrder.total !== oldOrder.total;
      const modifiedDateChanged =
        currentOrder.modifiedDate !== oldOrder.modifiedDate;

      let detailsChanged = false;
      if (currentOrder.orderDetails && oldOrder.orderDetails) {
        if (currentOrder.orderDetails.length !== oldOrder.orderDetails.length) {
          detailsChanged = true;
        } else {
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
      if (
        statusChanged ||
        totalChanged ||
        modifiedDateChanged ||
        detailsChanged
      ) {
        console.log(
          `Modified order detected: ${currentOrder.code} (Status changed: ${statusChanged}, Total changed: ${totalChanged})`
        );
        changedOrders.push({ ...currentOrder, changeType: "modified" });
      }
    } else {
      console.log(`New order detected: ${currentOrder.code}`);
      changedOrders.push({ ...currentOrder, changeType: "new" });
    }
  }

  console.log(
    `Found ${changedOrders.length} changed orders (${
      changedOrders.filter((o) => o.changeType === "new").length
    } new, ${
      changedOrders.filter((o) => o.changeType === "modified").length
    } modified)`
  );
  return changedOrders;
}

function findNewOrders(currentOrders, oldOrders) {
  if (!oldOrders || oldOrders.length === 0) return currentOrders;

  const oldOrderCodes = new Set(oldOrders.map((order) => order.code));

  return currentOrders.filter((order) => !oldOrderCodes.has(order.code));
}

module.exports = {
  setupPeriodicCheck,
};
