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

    // Make sure directory exists
    if (!fs.existsSync(path.join(parentDir, folderName))) {
      fs.mkdirSync(path.join(parentDir, folderName), { recursive: true });
      console.log(`Created directory: ${path.join(parentDir, folderName)}`);
    }

    // Initialize with empty array if file doesn't exist
    let existingData = [];

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        if (fileContent && fileContent.trim()) {
          existingData = JSON.parse(fileContent);
        }
      } catch (parseError) {
        console.warn(
          `Warning: Could not parse existing JSON file ${filePath}. Creating new file.`
        );
        // Continue with empty array if file exists but is invalid
      }
    }

    // Ensure existingData is an array
    if (!Array.isArray(existingData)) {
      existingData = [];
    }

    // Process newData correctly regardless of its format
    const newDataArray = Array.isArray(newData.data)
      ? newData.data
      : newData.data
      ? [newData.data]
      : Array.isArray(newData)
      ? newData
      : [newData];

    // Function to check if an item is a duplicate
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

    // Filter out duplicates
    const uniqueNew = newDataArray.filter((newItem) => {
      if (!newItem) return false;

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
    // Check if data is valid
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.log("No data to save. Skipping database and JSON operations.");
      return {
        success: true,
        stats: {
          total: 0,
          success: 0,
          newRecords: 0,
          savedToJson: 0,
        },
      };
    }

    // Save to MySQL database
    const dbResult = await dbSaveFunction(data);

    // Prepare data for JSON saving
    const dataToSave = {
      date: new Date().toISOString().split("T")[0],
      data: data,
    };

    // Save to JSON file, but continue even if JSON saving fails
    let jsonResult = { success: false, data: [] };
    try {
      jsonResult = await appendJsonDataToFile(dataToSave, folderName, fileName);
    } catch (jsonError) {
      console.error("Error saving to JSON:", jsonError);
      // Continue despite JSON error - MySQL data is still saved
    }

    return {
      success: dbResult.success,
      stats: {
        total: (dbResult.stats && dbResult.stats.total) || 0,
        success: (dbResult.stats && dbResult.stats.success) || 0,
        newRecords: (dbResult.stats && dbResult.stats.newRecords) || 0,
        savedToJson: jsonResult.data ? jsonResult.data.length : 0,
      },
    };
  } catch (error) {
    console.error("Error saving data to both JSON and MySQL:", error);
    return {
      success: false,
      error: error.message,
      stats: {
        total: 0,
        success: 0,
        newRecords: 0,
        savedToJson: 0,
      },
    };
  }
};

module.exports = {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
};
