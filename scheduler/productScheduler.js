const { getProducts, getProductsByDate } = require("../src/kiotviet");
const productService = require("../src/db/productService");

const productSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current products (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentProducts = await getProducts();

      if (
        currentProducts &&
        currentProducts.data &&
        Array.isArray(currentProducts.data)
      ) {
        if (currentProducts.data.length === 0) {
          console.log("No new products to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(`Processing ${currentProducts.data.length} products...`);
        const result = await productService.saveProducts(currentProducts.data);

        await productService.updateSyncStatus(true, new Date());

        console.log(
          `Product sync completed: ${result.stats.success} processed, ${result.stats.newRecords} new`
        );

        return {
          success: true,
          savedCount: result.stats.newRecords,
          hasNewData: result.stats.newRecords > 0,
        };
      }

      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;
      console.error(
        `Product sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Product sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const productScheduler = async (daysAgo) => {
  try {
    const productsByDate = await getProductsByDate(daysAgo);
    let totalSaved = 0;

    for (const dateData of productsByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} products from ${dateData.date}`
        );
        const result = await productService.saveProducts(dateData.data.data);
        totalSaved += result.stats.success;
      }
    }

    await productService.updateSyncStatus(true, new Date());
    console.log(`Historical products data saved: ${totalSaved} products total`);

    return {
      success: true,
      message: `Saved ${totalSaved} products from historical data`,
    };
  } catch (error) {
    console.error("Cannot create productSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  productScheduler,
  productSchedulerCurrent,
};
