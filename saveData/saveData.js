const path = require("path");
const fs = require("fs");

const saveJsonDataToFile = (jsonData, folderName, fileName) => {
  try {
    const parentDir = path.resolve(__dirname, "..");
    const targetDir = path.join(parentDir, folderName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`Đã tạo thư mục: ${targetDir}`);
    }
    const filePath = path.join(targetDir, fileName);

    const jsonString = JSON.stringify(jsonData, null, 2);

    fs.writeFileSync(filePath, jsonString, "utf8");

    console.log(`Dữ liệu đã được lưu thành công vào ${filePath}`);
    return {
      success: true,
      filePath: filePath,
      data: jsonData,
    };
  } catch (error) {
    console.error("Đã xảy ra lỗi khi lưu dữ liệu:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const appendJsonDataToFile = (newData, folderName, fileName) => {
  try {
    const parentDir = path.resolve(__dirname, "..");
    const filePath = path.join(parentDir, folderName, fileName);

    let existingData = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      existingData = JSON.parse(fileContent);
    }

    const newDataArray = Array.isArray(newData.data)
      ? newData.data
      : newData.data
      ? [newData.data]
      : [newData];

    const isOrderDuplicate = (existingDateEntry, newOrder) => {
      if (!existingDateEntry || typeof existingDateEntry !== "object") {
        return false;
      }

      const ordersArray = Array.isArray(existingDateEntry.data)
        ? existingDateEntry.data
        : Array.isArray(existingDateEntry)
        ? existingDateEntry
        : [];

      return ordersArray.some(
        (existingOrder) =>
          existingOrder &&
          (existingOrder.id === newOrder.id ||
            existingOrder.code === newOrder.code)
      );
    };

    const uniqueNew = newDataArray.filter((newOrderItem) => {
      const isDuplicate = existingData.some((existingDateEntry) =>
        isOrderDuplicate(existingDateEntry, newOrderItem)
      );

      return !isDuplicate;
    });

    if (uniqueNew.length > 0) {
      if (newData.date) {
        existingData.push({
          date: newData.date,
          daysAgo: newData.daysAgo || 0,
          data: uniqueNew,
        });
      } else {
        const currentDate = new Date().toISOString().split("T")[0];
        const currentDateEntry = existingData.find(
          (entry) => entry.date === currentDate
        );

        if (currentDateEntry) {
          if (!Array.isArray(currentDateEntry.data)) {
            currentDateEntry.data = [];
          }
          currentDateEntry.data.push(...uniqueNew);
        } else {
          existingData.push({
            date: currentDate,
            data: uniqueNew,
          });
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), "utf8");

      console.log(
        `Đã thêm ${uniqueNew.length} data mới không trùng lặp vào ${filePath}`
      );

      return {
        success: true,
        filePath: filePath,
        data: uniqueNew,
      };
    } else {
      console.log("Không có data mới để thêm.");
      return {
        success: true,
        filePath: filePath,
        data: [],
      };
    }
  } catch (error) {
    console.error("Đã xảy ra lỗi khi nối dữ liệu:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  saveJsonDataToFile,
  appendJsonDataToFile,
};
