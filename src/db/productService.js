const { getPool } = require("../db.js");

async function saveProduct(product) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // Start a transaction
    await connection.beginTransaction();

    // Extract key fields from product
    const {
      id,
      code,
      barCode = "",
      name,
      fullName = null,
      categoryId = null,
      categoryName = null,
      tradeMarkId = null,
      tradeMarkName = null,
      allowsSale = true,
      type = 2,
      hasVariants = false,
      basePrice = null,
      unit = null,
      conversionValue = 1,
      weight = 0,
      description = "",
      isActive = true,
      orderTemplate = "",
      isLotSerialControl = false,
      isBatchExpireControl = false,
      retailerId,
      modifiedDate = null,
      createdDate = null,
    } = product;

    // Store the entire product as JSON
    const jsonData = JSON.stringify(product);

    const query = `
      INSERT INTO products 
        (id, code, barCode, name, fullName, categoryId, categoryName, 
         tradeMarkId, tradeMarkName, allowsSale, type, hasVariants,
         basePrice, unit, conversionValue, weight, description, isActive, 
         orderTemplate, isLotSerialControl, isBatchExpireControl,
         retailerId, modifiedDate, createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        barCode = VALUES(barCode),
        name = VALUES(name),
        fullName = VALUES(fullName),
        categoryId = VALUES(categoryId),
        categoryName = VALUES(categoryName),
        tradeMarkId = VALUES(tradeMarkId),
        tradeMarkName = VALUES(tradeMarkName),
        allowsSale = VALUES(allowsSale),
        type = VALUES(type),
        hasVariants = VALUES(hasVariants),
        basePrice = VALUES(basePrice),
        unit = VALUES(unit),
        conversionValue = VALUES(conversionValue),
        weight = VALUES(weight),
        description = VALUES(description),
        isActive = VALUES(isActive),
        orderTemplate = VALUES(orderTemplate),
        isLotSerialControl = VALUES(isLotSerialControl),
        isBatchExpireControl = VALUES(isBatchExpireControl),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      barCode,
      name,
      fullName,
      categoryId,
      categoryName,
      tradeMarkId,
      tradeMarkName,
      allowsSale,
      type,
      hasVariants,
      basePrice,
      unit,
      conversionValue,
      weight,
      description,
      isActive,
      orderTemplate,
      isLotSerialControl,
      isBatchExpireControl,
      retailerId,
      modifiedDate,
      createdDate,
      jsonData,
    ]);

    // Now handle inventory data if present
    if (product.inventories && Array.isArray(product.inventories)) {
      // First, delete existing inventory records for this product to avoid conflicts
      await connection.execute(
        "DELETE FROM product_inventories WHERE productId = ?",
        [id]
      );

      for (const inventory of product.inventories) {
        try {
          const {
            productId,
            productCode,
            productName,
            branchId,
            branchName,
            cost = 0,
            onHand = 0,
            reserved = 0,
            actualReserved = 0,
            minQuantity = 0,
            maxQuantity = 0,
            isActive = true,
            onOrder = 0,
          } = inventory;

          const inventoryQuery = `
            INSERT INTO product_inventories 
              (productId, productCode, productName, branchId, branchName, 
               cost, onHand, reserved, actualReserved, minQuantity, 
               maxQuantity, isActive, onOrder)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(inventoryQuery, [
            productId,
            productCode,
            productName,
            branchId,
            branchName,
            cost,
            onHand,
            reserved,
            actualReserved,
            minQuantity,
            maxQuantity,
            isActive,
            onOrder,
          ]);
        } catch (invError) {
          console.warn(
            `Warning: Could not save inventory for product ID ${
              inventory.productId || id
            }, branch ${inventory.branchId}: ${invError.message}`
          );
          // Continue with other inventories
        }
      }
    }

    // Handle price books if present
    if (product.priceBooks && Array.isArray(product.priceBooks)) {
      // Delete existing price books for this product
      await connection.execute(
        "DELETE FROM product_price_books WHERE productId = ?",
        [id]
      );

      for (const priceBook of product.priceBooks) {
        try {
          const {
            productId,
            priceBookId,
            priceBookName,
            price = 0,
            isActive = true,
            startDate = null,
            endDate = null,
          } = priceBook;

          const priceBookQuery = `
            INSERT INTO product_price_books
              (productId, priceBookId, priceBookName, price, isActive, startDate, endDate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(priceBookQuery, [
            productId,
            priceBookId,
            priceBookName,
            price,
            isActive,
            startDate,
            endDate,
          ]);
        } catch (pbError) {
          console.warn(
            `Warning: Could not save price book for product ID ${
              priceBook.productId || id
            }, priceBookId ${priceBook.priceBookId}: ${pbError.message}`
          );
          // Continue with other price books
        }
      }
    }

    // Commit the transaction
    await connection.commit();
    return { success: true };
  } catch (error) {
    // Rollback the transaction on error
    await connection.rollback();
    console.error(`Error saving product ${product.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    // Release the connection
    connection.release();
  }
}

async function saveProducts(products) {
  const pool = getPool();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;

  for (const product of products) {
    const [existing] = await pool.execute(
      "SELECT id, code FROM products WHERE id = ?",
      [product.id]
    );

    const isNew = existing.length === 0;
    const isUpdated =
      !isNew &&
      new Date(product.createdDate) > new Date(existing[0].createdDate);

    if (isNew || isUpdated) {
      const result = await saveProduct(product);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  return {
    success: failCount === 0,
    stats: {
      total: products.length,
      success: successCount,
      newRecords: newCount,
      failed: failCount,
    },
  };
}

async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'products'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      console.warn(
        "No sync_status record was updated. Attempting to insert..."
      );

      // Try to insert instead
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('products', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      const [insertResult] = await pool.execute(insertQuery, [
        lastSync,
        completed,
      ]);
      console.log(`Sync status insert result: ${JSON.stringify(insertResult)}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating product sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["products"]
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: rows[0].historical_completed === 1,
      };
    }

    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } catch (error) {
    console.error("Error getting product sync status:", error);
    throw error;
  }
}

module.exports = {
  saveProduct,
  saveProducts,
  updateSyncStatus,
  getSyncStatus,
};
