const { getPool } = require("../db.js");

// Add data validation and sanitization
function validateAndSanitizeProduct(product) {
  return {
    ...product,
    code: product.code ? String(product.code).substring(0, 50) : "",
    name: product.name ? String(product.name).substring(0, 255) : "",
    fullName: product.fullName
      ? String(product.fullName).substring(0, 255)
      : null,
    categoryName: product.categoryName
      ? String(product.categoryName).substring(0, 100)
      : null,
    basePrice: isNaN(Number(product.basePrice)) ? 0 : Number(product.basePrice),
    weight: isNaN(Number(product.weight)) ? 0 : Number(product.weight),
    description: product.description
      ? String(product.description).substring(0, 1000)
      : "",
  };
}

async function saveProducts(products) {
  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  const BATCH_SIZE = 50;

  try {
    await connection.beginTransaction();

    // Process in batches
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);

      for (const product of batch) {
        try {
          // Validate and sanitize
          const validatedProduct = validateAndSanitizeProduct(product);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM products WHERE id = ?",
            [validatedProduct.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            new Date(validatedProduct.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveProduct(validatedProduct, connection);
            if (result.success) {
              successCount++;
              if (isNew) newCount++;
              else updatedCount++;
            } else {
              failCount++;
            }
          }
        } catch (error) {
          console.error(
            `Error processing product ${product.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed product batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          products.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Product sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Product transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: products.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveProduct to accept connection parameter
async function saveProduct(product, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
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

    // Handle inventory data if present
    if (product.inventories && Array.isArray(product.inventories)) {
      await connection.execute(
        "DELETE FROM product_inventories WHERE productId = ?",
        [id]
      );

      for (const inventory of product.inventories) {
        try {
          const inventoryQuery = `
            INSERT INTO product_inventories 
              (productId, productCode, productName, branchId, branchName, 
               cost, onHand, reserved, actualReserved, minQuantity, 
               maxQuantity, isActive, onOrder)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(inventoryQuery, [
            inventory.productId || id,
            inventory.productCode || code,
            inventory.productName || name,
            inventory.branchId,
            inventory.branchName,
            inventory.cost || 0,
            inventory.onHand || 0,
            inventory.reserved || 0,
            inventory.actualReserved || 0,
            inventory.minQuantity || 0,
            inventory.maxQuantity || 0,
            inventory.isActive || true,
            inventory.onOrder || 0,
          ]);
        } catch (invError) {
          console.warn(
            `Warning: Could not save inventory for product ${id}, branch ${inventory.branchId}: ${invError.message}`
          );
        }
      }
    }

    // Handle price books if present
    if (product.priceBooks && Array.isArray(product.priceBooks)) {
      await connection.execute(
        "DELETE FROM product_price_books WHERE productId = ?",
        [id]
      );

      for (const priceBook of product.priceBooks) {
        try {
          const priceBookQuery = `
            INSERT INTO product_price_books
              (productId, priceBookId, priceBookName, price, isActive, startDate, endDate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(priceBookQuery, [
            priceBook.productId || id,
            priceBook.priceBookId,
            priceBook.priceBookName,
            priceBook.price || 0,
            priceBook.isActive || true,
            priceBook.startDate || null,
            priceBook.endDate || null,
          ]);
        } catch (pbError) {
          console.warn(
            `Warning: Could not save price book for product ${id}: ${pbError.message}`
          );
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving product ${product.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// Keep existing updateSyncStatus and getSyncStatus functions
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
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('products', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
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
