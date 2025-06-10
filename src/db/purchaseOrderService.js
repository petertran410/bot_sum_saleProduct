const { getPool } = require("../db.js");

// Add data validation and sanitization
function validateAndSanitizePurchaseOrder(purchaseOrder) {
  return {
    ...purchaseOrder,
    code: purchaseOrder.code ? String(purchaseOrder.code).substring(0, 50) : "",
    supplierName: purchaseOrder.supplierName
      ? String(purchaseOrder.supplierName).substring(0, 255)
      : null,
    supplierCode: purchaseOrder.supplierCode
      ? String(purchaseOrder.supplierCode).substring(0, 50)
      : null,
    total: isNaN(Number(purchaseOrder.total)) ? 0 : Number(purchaseOrder.total),
    paidAmount: isNaN(Number(purchaseOrder.paidAmount))
      ? 0
      : Number(purchaseOrder.paidAmount),
    description: purchaseOrder.description
      ? String(purchaseOrder.description).substring(0, 1000)
      : "",
  };
}

async function savePurchaseOrders(purchaseOrders) {
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
    for (let i = 0; i < purchaseOrders.length; i += BATCH_SIZE) {
      const batch = purchaseOrders.slice(i, i + BATCH_SIZE);

      for (const purchaseOrder of batch) {
        try {
          // Validate and sanitize
          const validatedPurchaseOrder =
            validateAndSanitizePurchaseOrder(purchaseOrder);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM purchase_orders WHERE id = ?",
            [validatedPurchaseOrder.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedPurchaseOrder.modifiedDate &&
            new Date(validatedPurchaseOrder.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await savePurchaseOrder(
              validatedPurchaseOrder,
              connection
            );
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
            `Error processing purchase order ${purchaseOrder.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed purchase order batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(purchaseOrders.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Purchase order sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Purchase order transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: purchaseOrders.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

async function savePurchaseOrder(purchaseOrder, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract key fields from purchase order
    const {
      id,
      code,
      branchId,
      branchName = null,
      purchaseDate,
      discountRatio = 0,
      discount = 0,
      total = 0,
      supplierId = null,
      supplierName = null,
      supplierCode = null,
      partnerType = null,
      purchaseById = null,
      purchaseName = null,
      status = 0,
      statusValue = null,
      description = null,
      isDraft = false,
      paidAmount = 0,
      paymentMethod = null,
      accountId = null,
      retailerId,
      createdDate = null,
      modifiedDate = null,
    } = purchaseOrder;

    // Store the entire purchase order as JSON
    const jsonData = JSON.stringify(purchaseOrder);

    // ✅ MAIN FIX: Check for existing records by BOTH id and code
    const [existingByCode] = await connection.execute(
      "SELECT id, code FROM purchase_orders WHERE code = ?",
      [code]
    );

    const [existingById] = await connection.execute(
      "SELECT id, code FROM purchase_orders WHERE id = ?",
      [id]
    );

    // Determine the action needed
    const existsByCode = existingByCode.length > 0;
    const existsById = existingById.length > 0;

    let actualId = id;

    if (existsByCode && existsById) {
      // Both exist - check if they're the same record
      if (existingByCode[0].id === existingById[0].id) {
        // Same record, update it
        actualId = existingByCode[0].id;
      } else {
        // Different records - this is a data conflict
        console.warn(
          `Data conflict: Purchase order code ${code} exists with different ID`
        );
        // Use the existing ID from the code match to avoid duplicate
        actualId = existingByCode[0].id;
      }
    } else if (existsByCode && !existsById) {
      // Code exists but with different ID
      actualId = existingByCode[0].id;
    } else if (!existsByCode && existsById) {
      // ID exists but with different code - this shouldn't happen but handle it
      console.warn(`Purchase order ID ${id} exists with different code`);
      actualId = id;
    }
    // If neither exists, we can insert with the original ID

    if (existsByCode || existsById) {
      // Update existing record
      const updateQuery = `
        UPDATE purchase_orders SET
          code = ?, branchId = ?, branchName = ?, purchaseDate = ?, discountRatio = ?, 
          discount = ?, total = ?, supplierId = ?, supplierName = ?, supplierCode = ?,
          partnerType = ?, purchaseById = ?, purchaseName = ?, status = ?, statusValue = ?,
          description = ?, isDraft = ?, paidAmount = ?, paymentMethod = ?, accountId = ?,
          modifiedDate = ?, jsonData = ?
        WHERE id = ?
      `;

      await connection.execute(updateQuery, [
        code,
        branchId,
        branchName,
        purchaseDate,
        discountRatio,
        discount,
        total,
        supplierId,
        supplierName,
        supplierCode,
        partnerType,
        purchaseById,
        purchaseName,
        status,
        statusValue,
        description,
        isDraft,
        paidAmount,
        paymentMethod,
        accountId,
        modifiedDate,
        jsonData,
        actualId,
      ]);

      console.log(
        `✅ Updated existing purchase order ${code} with ID ${actualId}`
      );
    } else {
      // Insert new record
      const insertQuery = `
        INSERT INTO purchase_orders 
          (id, code, branchId, branchName, purchaseDate, discountRatio, discount, total,
           supplierId, supplierName, supplierCode, partnerType, purchaseById, purchaseName,
           status, statusValue, description, isDraft, paidAmount, paymentMethod, accountId,
           retailerId, createdDate, modifiedDate, jsonData)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(insertQuery, [
        actualId,
        code,
        branchId,
        branchName,
        purchaseDate,
        discountRatio,
        discount,
        total,
        supplierId,
        supplierName,
        supplierCode,
        partnerType,
        purchaseById,
        purchaseName,
        status,
        statusValue,
        description,
        isDraft,
        paidAmount,
        paymentMethod,
        accountId,
        retailerId,
        createdDate,
        modifiedDate,
        jsonData,
      ]);

      console.log(`✅ Inserted new purchase order ${code} with ID ${actualId}`);
    }

    // Now handle the related records using the correct actualId
    await connection.execute(
      "DELETE FROM purchase_order_details WHERE purchaseOrderId = ?",
      [actualId]
    );

    // Handle purchase order details if present
    if (
      purchaseOrder.purchaseOrderDetails &&
      Array.isArray(purchaseOrder.purchaseOrderDetails)
    ) {
      for (const detail of purchaseOrder.purchaseOrderDetails) {
        const {
          productId,
          productCode = null,
          productName = null,
          quantity = 0,
          price = 0,
          discount = 0,
          discountRatio = 0,
          description = null,
          serialNumbers = null,
        } = detail;

        try {
          const [detailResult] = await connection.execute(
            `
            INSERT INTO purchase_order_details 
              (purchaseOrderId, productId, productCode, productName, quantity, 
               price, discount, discountRatio, description, serialNumbers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              actualId, // Use actualId instead of original id
              productId,
              productCode,
              productName,
              quantity,
              price,
              discount,
              discountRatio,
              description,
              serialNumbers,
            ]
          );

          const detailId = detailResult.insertId;

          // Handle batch expires if present
          if (detail.productBatchExpire) {
            const batch = detail.productBatchExpire;
            await connection.execute(
              `
              INSERT INTO purchase_order_batch_expires
                (purchaseOrderDetailId, productId, batchName, fullNameVirgule, expireDate, createdDate)
              VALUES (?, ?, ?, ?, ?, ?)
              `,
              [
                detailId,
                batch.productId || productId,
                batch.batchName || null,
                batch.fullNameVirgule || null,
                batch.expireDate || null,
                batch.createdDate || null,
              ]
            );
          }
        } catch (detailError) {
          console.error(
            `Failed to save detail for purchase order ${code}:`,
            detailError.message
          );
          // Don't throw - just log and continue with other details
        }
      }
    }

    // Handle payments if present
    if (purchaseOrder.payments && Array.isArray(purchaseOrder.payments)) {
      await connection.execute(
        "DELETE FROM purchase_order_payments WHERE purchaseOrderId = ?",
        [actualId]
      );

      for (const payment of purchaseOrder.payments) {
        const {
          id: paymentId,
          code: paymentCode,
          amount = 0,
          method = null,
          status = 0,
          statusValue = null,
          transDate = null,
          accountId = null,
          bankAccount = null,
          description = null,
        } = payment;

        try {
          await connection.execute(
            `
            INSERT INTO purchase_order_payments 
              (id, purchaseOrderId, code, amount, method, status, statusValue, 
               transDate, accountId, bankAccount, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              paymentId,
              actualId, // Use actualId
              paymentCode,
              amount,
              method,
              status,
              statusValue,
              transDate,
              accountId,
              bankAccount,
              description,
            ]
          );
        } catch (paymentError) {
          console.error(
            `Failed to save payment for purchase order ${code}:`,
            paymentError.message
          );
        }
      }
    }

    // Handle surcharges if present
    if (purchaseOrder.surcharges && Array.isArray(purchaseOrder.surcharges)) {
      await connection.execute(
        "DELETE FROM purchase_order_surcharges WHERE purchaseOrderId = ?",
        [actualId]
      );

      for (const surcharge of purchaseOrder.surcharges) {
        const {
          code: surchargeCode,
          name: surchargeName,
          value = 0,
          valueRatio = 0,
          isSupplierExpense = false,
          type = 0,
        } = surcharge;

        try {
          await connection.execute(
            `
            INSERT INTO purchase_order_surcharges
              (purchaseOrderId, code, name, value, valueRatio, isSupplierExpense, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              actualId, // Use actualId
              surchargeCode,
              surchargeName,
              value,
              valueRatio,
              isSupplierExpense,
              type,
            ]
          );
        } catch (surchargeError) {
          console.error(
            `Failed to save surcharge for purchase order ${code}:`,
            surchargeError.message
          );
        }
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(`Error saving purchase order ${purchaseOrder.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'purchase_orders'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('purchase_orders', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating purchase order sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["purchase_orders"]
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
    console.error("Error getting purchase order sync status:", error);
    throw error;
  }
}

module.exports = {
  savePurchaseOrder,
  savePurchaseOrders,
  updateSyncStatus,
  getSyncStatus,
};
