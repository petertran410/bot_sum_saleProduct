const path = require("path");
const fs = require("fs");

/**
 * Save JSON data to a file
 * @param {Object} jsonData - The data to save
 * @param {string} folderName - The folder name to save to
 * @param {string} fileName - The file name to save as
 * @returns {Object} Result object with success status
 */
const saveJsonDataToFile = (jsonData, folderName, fileName) => {
  try {
    const parentDir = path.resolve(__dirname, "..");
    const targetDir = path.join(parentDir, folderName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`Created directory: ${targetDir}`);
    }
    const filePath = path.join(targetDir, fileName);

    const jsonString = JSON.stringify(jsonData, null, 2);

    fs.writeFileSync(filePath, jsonString, "utf8");

    console.log(`Data successfully saved to ${filePath}`);
    return {
      success: true,
      filePath: filePath,
      data: jsonData,
    };
  } catch (error) {
    console.error("Error occurred while saving data:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Append JSON data to an existing file, avoiding duplicates
 * @param {Object} newData - The new data to append
 * @param {string} folderName - The folder name where the file is stored
 * @param {string} fileName - The file name to append to
 * @returns {Object} Result object with success status and data
 */
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

    const isItemDuplicate = (existingDateEntry, newItem) => {
      if (!existingDateEntry || typeof existingDateEntry !== "object") {
        return false;
      }

      const itemsArray = Array.isArray(existingDateEntry.data)
        ? existingDateEntry.data
        : Array.isArray(existingDateEntry)
        ? existingDateEntry
        : [];

      return itemsArray.some(
        (existingItem) =>
          existingItem &&
          (existingItem.id === newItem.id || existingItem.code === newItem.code)
      );
    };

    const uniqueNew = newDataArray.filter((newItem) => {
      const isDuplicate = existingData.some((existingDateEntry) =>
        isItemDuplicate(existingDateEntry, newItem)
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
        `Added ${uniqueNew.length} new non-duplicate items to ${filePath}`
      );

      return {
        success: true,
        filePath: filePath,
        data: uniqueNew,
      };
    } else {
      console.log("No new data to add.");
      return {
        success: true,
        filePath: filePath,
        data: [],
      };
    }
  } catch (error) {
    console.error("Error occurred while appending data:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Save data to both JSON file and MySQL database
 * @param {Object} data - The data to save
 * @param {Function} dbSaveFunction - The database saving function
 * @param {string} folderName - The folder name to save JSON to
 * @param {string} fileName - The file name to save JSON as
 * @returns {Object} Result object with success status and stats
 */
const saveBothJsonAndMySQL = async (
  data,
  dbSaveFunction,
  folderName,
  fileName
) => {
  try {
    // Save to MySQL database
    const dbResult = await dbSaveFunction(data);

    // Save to JSON file
    const jsonResult = await appendJsonDataToFile(
      { date: new Date().toISOString().split("T")[0], data: data },
      folderName,
      fileName
    );

    return {
      success: dbResult.success && jsonResult.success,
      stats: {
        total: (dbResult.stats && dbResult.stats.total) || 0,
        success: (dbResult.stats && dbResult.stats.success) || 0,
        newRecords: (dbResult.stats && dbResult.stats.newRecords) || 0,
        savedToJson: jsonResult.data.length,
      },
    };
  } catch (error) {
    console.error("Error saving data to both JSON and MySQL:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
};
