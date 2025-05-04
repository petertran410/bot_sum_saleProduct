const { getProducts, getProductsByDate } = require("../src/kiotviet");
const productService = require("../src/db/productService");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
  saveBothJsonAndMySQL,
} = require("../saveData/saveData");

const productScheduler = async (daysAgo) => {
  try {
    const productsByDate = await getProductsByDate(daysAgo);

    // Save all orders to database
    let totalSaved = 0;

    for (const dateData of productsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        // Save to database
        const result = await productService.saveProducts(dateData.data.data);
        totalSaved += result.stats.success;

        // Also save to JSON file
        if (dateData.data.data.length > 0) {
          await appendJsonDataToFile(
            {
              date: dateData.date,
              data: dateData.data.data,
            },
            "saveJson",
            "products.json"
          );
        }

        console.log(
          `Saved ${result.stats.success} products from ${dateData.date}`
        );
      }
    }

    // Mark historical data as completed
    await productService.updateSyncStatus(true, new Date());

    console.log(`Historical products data saved: ${totalSaved} products total`);

    return {
      success: true,
      message: `Saved ${totalSaved} products from historical data`,
    };
  } catch (error) {
    console.log("Cannot create productSchedulerByDate", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const productSchedulerCurrent = async () => {
  try {
    const currentProducts = await getProducts();

    if (
      currentProducts &&
      currentProducts.data &&
      Array.isArray(currentProducts.data)
    ) {
      const result = await saveBothJsonAndMySQL(
        currentProducts.data,
        productService.saveProducts,
        "saveJson",
        "products.json"
      );

      await productService.updateSyncStatus(true, new Date());

      console.log(
        `Current products data saved: ${result.stats.newRecords} new products out of ${result.stats.success} processed. ${result.stats.savedToJson} saved to JSON.`
      );

      return {
        success: true,
        data: currentProducts.data,
        savedCount: result.stats.newRecords,
        hasNewData: result.stats.newRecords > 0,
      };
    } else {
      console.log("No new products data to save");
      return {
        success: true,
        data: [],
        savedCount: 0,
        hasNewData: false,
      };
    }
  } catch (error) {
    console.log("Cannot save current products", error);
    return {
      success: false,
      error: error.message,
      hasNewData: false,
    };
  }
};

module.exports = {
  productScheduler,
  productSchedulerCurrent,
};
