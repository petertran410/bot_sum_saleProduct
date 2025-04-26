const { getOrders, getOrdersByDate } = require("../src/kiotviet");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
} = require("../saveData/saveData");
const fs = require("fs");
const path = require("path");

const orderScheduler = async (daysAgo) => {
  try {
    const ordersByDate = await getOrdersByDate(daysAgo);

    const folderName = "saveJson";
    const fileName = "orders.json";
    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const result = saveJsonDataToFile(ordersByDate, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot create orderSchedulerByDate", error);
    throw error;
  }
};

const orderSchedulerCurrent = async () => {
  try {
    const folderName = "saveJson";
    const fileName = "orders.json";
    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const currentOrders = await getOrders();

    const result = appendJsonDataToFile(currentOrders, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot append current orders", error);
    throw error;
  }
};

module.exports = {
  orderScheduler,
  orderSchedulerCurrent,
};
