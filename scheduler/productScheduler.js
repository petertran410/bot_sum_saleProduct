const { getProducts, getProductsByDate } = require("../src/kiotviet");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
} = require("../saveData/saveData");

const fs = require("fs");
const path = require("path");

const productScheduler = async (daysAgo) => {
  try {
    const productsByDate = await getProductsByDate(daysAgo);

    const folderName = "saveJson";
    const fileName = "products.json";
    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const result = saveJsonDataToFile(productsByDate, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot create productSchedulerByDate", error);
    throw error;
  }
};

const productSchedulerCurrent = async () => {
  try {
    const folderName = "saveJson";
    const fileName = "products.json";

    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const currentProducts = await getProducts();
    const result = appendJsonDataToFile(currentProducts, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot append current products", error);
    throw error;
  }
};

module.exports = {
  productScheduler,
  productSchedulerCurrent,
};
