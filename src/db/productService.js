const { getPool } = require("../db.js");
const {
  convertUndefinedToNull,
  validateString,
  validateNumber,
  validateBoolean,
} = require("./utils");

// Add data validation and sanitization
function validateAndSanitizeProduct(product) {
  return {
    ...product,
    code: validateString(product.code, 50, ""),
    name: validateString(product.name, 255, ""),
    fullName: validateString(product.fullName, 255),
    categoryName: validateString(product.categoryName, 100),
    basePrice: validateNumber(product.basePrice, 0),
    weight: validateNumber(product.weight, 0),
    description: validateString(product.description, 1000, ""),
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

// FIXED: Update saveProduct to accept connection parameter and handle undefined values
async function saveProduct(product, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Extract and convert all undefined to null
    const id = convertUndefinedToNull(product.id);
    const code = convertUndefinedToNull(product.code) || "";
    const barCode = convertUndefinedToNull(product.barCode) || "";
    const name = convertUndefinedToNull(product.name) || "";
    const fullName = convertUndefinedToNull(product.fullName);
    const categoryId = convertUndefinedToNull(product.categoryId);
    const categoryName = convertUndefinedToNull(product.categoryName);
    const tradeMarkId = convertUndefinedToNull(product.tradeMarkId);
    const tradeMarkName = convertUndefinedToNull(product.tradeMarkName);
    const allowsSale = convertUndefinedToNull(product.allowsSale) ?? true;
    const type = convertUndefinedToNull(product.type) || 2;
    const hasVariants = convertUndefinedToNull(product.hasVariants) ?? false;
    const basePrice = convertUndefinedToNull(product.basePrice);
    const unit = convertUndefinedToNull(product.unit);
    const conversionValue =
      convertUndefinedToNull(product.conversionValue) || 1;
    const weight = convertUndefinedToNull(product.weight) || 0;
    const description = convertUndefinedToNull(product.description) || "";
    const isActive = convertUndefinedToNull(product.isActive) ?? true;
    const orderTemplate = convertUndefinedToNull(product.orderTemplate) || "";
    const isLotSerialControl =
      convertUndefinedToNull(product.isLotSerialControl) ?? false;
    const isBatchExpireControl =
      convertUndefinedToNull(product.isBatchExpireControl) ?? false;
    const retailerId = convertUndefinedToNull(product.retailerId);
    const modifiedDate = convertUndefinedToNull(product.modifiedDate);
    const createdDate = convertUndefinedToNull(product.createdDate);

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
            convertUndefinedToNull(inventory.productId) || id,
            convertUndefinedToNull(inventory.productCode) || code,
            convertUndefinedToNull(inventory.productName) || name,
            convertUndefinedToNull(inventory.branchId),
            convertUndefinedToNull(inventory.branchName),
            convertUndefinedToNull(inventory.cost) || 0,
            convertUndefinedToNull(inventory.onHand) || 0,
            convertUndefinedToNull(inventory.reserved) || 0,
            convertUndefinedToNull(inventory.actualReserved) || 0,
            convertUndefinedToNull(inventory.minQuantity) || 0,
            convertUndefinedToNull(inventory.maxQuantity) || 0,
            convertUndefinedToNull(inventory.isActive) ?? true,
            convertUndefinedToNull(inventory.onOrder) || 0,
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
            convertUndefinedToNull(priceBook.productId) || id,
            convertUndefinedToNull(priceBook.priceBookId),
            convertUndefinedToNull(priceBook.priceBookName),
            convertUndefinedToNull(priceBook.price) || 0,
            convertUndefinedToNull(priceBook.isActive) ?? true,
            convertUndefinedToNull(priceBook.startDate),
            convertUndefinedToNull(priceBook.endDate),
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
