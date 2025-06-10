const {
  getPricebooks,
  getPricebooksByDate,
  getPricebookDetails,
} = require("../src/kiotviet");
const pricebookService = require("../src/db/pricebookService");
const productService = require("../src/db/productService");

const pricebookSchedulerCurrent = async () => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(
        `Fetching current pricebooks (attempt ${
          retryCount + 1
        }/${MAX_RETRIES})...`
      );
      const currentPricebooks = await getPricebooks();

      if (
        currentPricebooks &&
        currentPricebooks.data &&
        Array.isArray(currentPricebooks.data)
      ) {
        if (currentPricebooks.data.length === 0) {
          console.log("No new pricebooks to process");
          return { success: true, savedCount: 0, hasNewData: false };
        }

        console.log(
          `Processing ${currentPricebooks.data.length} pricebooks...`
        );
        const result = await pricebookService.savePricebooks(
          currentPricebooks.data
        );

        // Also sync product prices for each pricebook
        let totalProductPricesUpdated = 0;
        for (const pricebook of currentPricebooks.data) {
          try {
            console.log(
              `Syncing product prices for pricebook ${pricebook.id}...`
            );
            const pricebookDetails = await getPricebookDetails(pricebook.id);

            if (
              pricebookDetails &&
              pricebookDetails.data &&
              pricebookDetails.data.length > 0
            ) {
              // Update product_price_books table
              await updateProductPrices(pricebook.id, pricebookDetails.data);
              totalProductPricesUpdated += pricebookDetails.data.length;
            }

            // Small delay between pricebook details requests
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (detailError) {
            console.warn(
              `Could not sync product prices for pricebook ${pricebook.id}:`,
              detailError.message
            );
          }
        }

        await pricebookService.updateSyncStatus(true, new Date());

        console.log(
          `Pricebook sync completed: ${result.stats.success} pricebooks processed, ${result.stats.newRecords} new, ${totalProductPricesUpdated} product prices updated`
        );

        return {
          success: true,
          savedCount: result.stats.newRecords,
          hasNewData: result.stats.newRecords > 0,
          productPricesUpdated: totalProductPricesUpdated,
        };
      }

      return { success: true, savedCount: 0, hasNewData: false };
    } catch (error) {
      retryCount++;
      console.error(
        `Pricebook sync attempt ${retryCount} failed:`,
        error.message
      );

      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        console.error("Max retries reached. Pricebook sync failed.");
        return { success: false, error: error.message, hasNewData: false };
      }
    }
  }
};

const pricebookScheduler = async (daysAgo) => {
  try {
    const pricebooksByDate = await getPricebooksByDate(daysAgo);
    let totalSaved = 0;
    let totalProductPricesUpdated = 0;

    for (const dateData of pricebooksByDate) {
      if (
        dateData.data &&
        dateData.data.data &&
        Array.isArray(dateData.data.data)
      ) {
        console.log(
          `Processing ${dateData.data.data.length} pricebooks from ${dateData.date}`
        );
        const result = await pricebookService.savePricebooks(
          dateData.data.data
        );
        totalSaved += result.stats.success;

        // Also sync product prices for each pricebook
        for (const pricebook of dateData.data.data) {
          try {
            console.log(
              `Syncing product prices for pricebook ${pricebook.id} from ${dateData.date}...`
            );
            const pricebookDetails = await getPricebookDetails(pricebook.id);

            if (
              pricebookDetails &&
              pricebookDetails.data &&
              pricebookDetails.data.length > 0
            ) {
              // Update product_price_books table
              await updateProductPrices(pricebook.id, pricebookDetails.data);
              totalProductPricesUpdated += pricebookDetails.data.length;
            }

            // Small delay between requests
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (detailError) {
            console.warn(
              `Could not sync product prices for pricebook ${pricebook.id}:`,
              detailError.message
            );
          }
        }
      }
    }

    await pricebookService.updateSyncStatus(true, new Date());
    console.log(
      `Historical pricebooks data saved: ${totalSaved} pricebooks total, ${totalProductPricesUpdated} product prices updated`
    );

    return {
      success: true,
      message: `Saved ${totalSaved} pricebooks and ${totalProductPricesUpdated} product prices from historical data`,
    };
  } catch (error) {
    console.error("Cannot create pricebookSchedulerByDate", error);
    return { success: false, error: error.message };
  }
};

// Helper function to update product prices
async function updateProductPrices(pricebookId, productPrices) {
  const { getPool } = require("../src/db");
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Delete existing prices for this pricebook
    await connection.execute(
      "DELETE FROM product_price_books WHERE priceBookId = ?",
      [pricebookId]
    );

    // Insert new prices
    for (const productPrice of productPrices) {
      try {
        const query = `
          INSERT INTO product_price_books 
            (productId, priceBookId, priceBookName, price, isActive, 
             startDate, endDate, createdDate, modifiedDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            price = VALUES(price),
            isActive = VALUES(isActive),
            startDate = VALUES(startDate),
            endDate = VALUES(endDate),
            modifiedDate = NOW()
        `;

        await connection.execute(query, [
          productPrice.productId,
          pricebookId,
          null, // priceBookName will be updated separately if needed
          productPrice.price || 0,
          true, // isActive
          null, // startDate
          null, // endDate
        ]);
      } catch (priceError) {
        console.warn(
          `Error updating price for product ${productPrice.productId}:`,
          priceError.message
        );
      }
    }

    await connection.commit();
    console.log(
      `Updated ${productPrices.length} product prices for pricebook ${pricebookId}`
    );
  } catch (error) {
    await connection.rollback();
    console.error(
      `Error updating product prices for pricebook ${pricebookId}:`,
      error.message
    );
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  pricebookScheduler,
  pricebookSchedulerCurrent,
};
