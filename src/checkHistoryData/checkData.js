const fs = require("fs");
const path = require("path");

const checkHistoricalDataStatus = () => {
  const folderName = "saveJson";
  const fileName = "historical_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (fs.existsSync(filePath)) {
      const status = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return status.completed || false;
    }
    return false;
  } catch (error) {
    return false;
  }
};

const checkInvoicesHistoricalDataStatus = () => {
  const folderName = "saveJson";
  const fileName = "historical_invoice_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (fs.existsSync(filePath)) {
      const status = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return status.completed || false;
    }
    return false;
  } catch (error) {
    return false;
  }
};

const checkProductsHistoricalDataStatus = () => {
  const folderName = "saveJson";
  const fileName = "historical_product_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (fs.existsSync(filePath)) {
      const status = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return status.completed || false;
    }
    return false;
  } catch (error) {
    return false;
  }
};

const markHistoricalDataCompleted = () => {
  const folderName = "saveJson";
  const fileName = "historical_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (
      !fs.existsSync(path.join(path.resolve(__dirname, "../.."), folderName))
    ) {
      fs.mkdirSync(path.join(path.resolve(__dirname, "../.."), folderName), {
        recursive: true,
      });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify({ completed: true }, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Không thể đánh dấu trạng thái:", error);
  }
};

const markInvoicesHistoricalDataCompleted = () => {
  const folderName = "saveJson";
  const fileName = "historical_invoice_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (
      !fs.existsSync(path.join(path.resolve(__dirname, "../.."), folderName))
    ) {
      fs.mkdirSync(path.join(path.resolve(__dirname, "../.."), folderName), {
        recursive: true,
      });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify({ completed: true }, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Không thể đánh dấu trạng thái:", error);
  }
};

const markProductsHistoricalDataCompleted = () => {
  const folderName = "saveJson";
  const fileName = "historical_product_status.json";
  const filePath = path.join(
    path.resolve(__dirname, "../.."),
    folderName,
    fileName
  );

  try {
    if (
      !fs.existsSync(path.join(path.resolve(__dirname, "../.."), folderName))
    ) {
      fs.mkdirSync(path.join(path.resolve(__dirname, "../.."), folderName), {
        recursive: true,
      });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify({ completed: true }, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.log("Không thể đánh dấu trạng thái:", error);
  }
};

module.exports = {
  checkHistoricalDataStatus,
  checkInvoicesHistoricalDataStatus,
  checkProductsHistoricalDataStatus,
  markHistoricalDataCompleted,
  markInvoicesHistoricalDataCompleted,
  markProductsHistoricalDataCompleted,
};
