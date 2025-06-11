const { getPool } = require("../db");

/**
 * Save individual order supplier to database
 * Follows the same pattern as saveProduct()
 */
async function saveOrderSupplier(orderSupplierData, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract main order supplier fields following KiotViet API structure
    const {
      id,
      code,
      invoiceId = null,
      orderDate,
      branchId = null,
      retailerId = null,
      userId = null,
      description = "",
      status = null,
      statusValue = null,
      discountRatio = null,
      productQty = 0,
      discount = 0,
      createdDate = null,
      createdBy = null,
      total = 0,
      exReturnSuppliers = 0,
      exReturnThirdParty = 0,
      totalAmt = 0,
      totalQty = 0,
      totalQuantity = 0,
      subTotal = 0,
      paidAmount = 0,
      toComplete = false,
      viewPrice = true,
      supplierDebt = 0,
      supplierOldDebt = 0,
      purchaseOrderCodes = "",
      orderSupplierDetails = [],
      OrderSupplierExpensesOthers = [],
    } = orderSupplierData;

    // Helper function for safe values (same as your other services)
    const safeValue = (value) =>
      value === undefined || value === null ? null : value;

    // Store complete JSON data
    const jsonData = JSON.stringify(orderSupplierData);

    // Insert main order supplier record
    const query = `
      INSERT INTO order_suppliers 
        (id, code, invoiceId, orderDate, branchId, retailerId, userId, 
         description, status, statusValue, discountRatio, productQty, discount,
         createdDate, createdBy, total, exReturnSuppliers, exReturnThirdParty,
         totalAmt, totalQty, totalQuantity, subTotal, paidAmount, toComplete,
         viewPrice, supplierDebt, supplierOldDebt, purchaseOrderCodes, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        invoiceId = VALUES(invoiceId),
        orderDate = VALUES(orderDate),
        branchId = VALUES(branchId),
        retailerId = VALUES(retailerId),
        userId = VALUES(userId),
        description = VALUES(description),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        discountRatio = VALUES(discountRatio),
        productQty = VALUES(productQty),
        discount = VALUES(discount),
        total = VALUES(total),
        exReturnSuppliers = VALUES(exReturnSuppliers),
        exReturnThirdParty = VALUES(exReturnThirdParty),
        totalAmt = VALUES(totalAmt),
        totalQty = VALUES(totalQty),
        totalQuantity = VALUES(totalQuantity),
        subTotal = VALUES(subTotal),
        paidAmount = VALUES(paidAmount),
        toComplete = VALUES(toComplete),
        viewPrice = VALUES(viewPrice),
        supplierDebt = VALUES(supplierDebt),
        supplierOldDebt = VALUES(supplierOldDebt),
        purchaseOrderCodes = VALUES(purchaseOrderCodes),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      safeValue(invoiceId),
      safeValue(orderDate),
      safeValue(branchId),
      safeValue(retailerId),
      safeValue(userId),
      description,
      safeValue(status),
      statusValue,
      discountRatio,
      productQty,
      discount,
      safeValue(createdDate),
      safeValue(createdBy),
      total,
      exReturnSuppliers,
      exReturnThirdParty,
      totalAmt,
      totalQty,
      totalQuantity,
      subTotal,
      paidAmount,
      toComplete,
      viewPrice,
      supplierDebt,
      supplierOldDebt,
      purchaseOrderCodes,
      jsonData,
    ]);

    // Clear existing details for this order supplier
    await connection.execute(
      "DELETE FROM order_supplier_details WHERE orderSupplierId = ?",
      [id]
    );

    // Insert order supplier details
    if (orderSupplierDetails && Array.isArray(orderSupplierDetails)) {
      for (const detail of orderSupplierDetails) {
        try {
          const detailQuery = `
            INSERT INTO order_supplier_details
              (orderSupplierId, productId, quantity, price, discount, allocation,
               createdDate, description, orderByNumber, allocationSuppliers,
               allocationThirdParty, orderQuantity, subTotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(detailQuery, [
            id,
            safeValue(detail.productId),
            safeValue(detail.quantity) || 0,
            safeValue(detail.price) || 0,
            safeValue(detail.discount) || 0,
            safeValue(detail.allocation) || 0,
            safeValue(detail.createdDate),
            detail.description || "",
            safeValue(detail.orderByNumber),
            safeValue(detail.allocationSuppliers) || 0,
            safeValue(detail.allocationThirdParty) || 0,
            safeValue(detail.orderQuantity) || 0,
            safeValue(detail.subTotal) || 0,
          ]);
        } catch (detailError) {
          console.warn(
            `Warning: Could not save order supplier detail for order ${id}: ${detailError.message}`
          );
        }
      }
    }

    // Clear existing expenses for this order supplier
    await connection.execute(
      "DELETE FROM order_supplier_expenses_others WHERE orderSupplierId = ?",
      [id]
    );

    // Insert order supplier expenses
    if (
      OrderSupplierExpensesOthers &&
      Array.isArray(OrderSupplierExpensesOthers)
    ) {
      for (const expense of OrderSupplierExpensesOthers) {
        try {
          const expenseQuery = `
            INSERT INTO order_supplier_expenses_others
              (orderSupplierId, form, expensesOtherOrder, expensesOtherCode,
               expensesOtherName, expensesOtherId, price, isReturnAuto,
               exValue, createdDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(expenseQuery, [
            id,
            safeValue(expense.form),
            safeValue(expense.expensesOtherOrder),
            expense.expensesOtherCode || "",
            expense.expensesOtherName || "",
            safeValue(expense.expensesOtherId),
            safeValue(expense.price) || 0,
            expense.isReturnAuto || false,
            safeValue(expense.exValue) || 0,
            safeValue(expense.createdDate),
          ]);
        } catch (expenseError) {
          console.warn(
            `Warning: Could not save order supplier expense for order ${id}: ${expenseError.message}`
          );
        }
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(
      `Error saving order supplier ${orderSupplierData.code}:`,
      error
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple order suppliers with batch processing
 * Follows the same pattern as saveProducts()
 */
async function saveOrderSuppliers(orderSuppliers) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const BATCH_SIZE = 50;

  let successCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let failCount = 0;

  try {
    await connection.beginTransaction();

    console.log(
      `Processing ${orderSuppliers.length} order suppliers in batches of ${BATCH_SIZE}...`
    );

    for (let i = 0; i < orderSuppliers.length; i += BATCH_SIZE) {
      const batch = orderSuppliers.slice(i, i + BATCH_SIZE);

      for (const orderSupplier of batch) {
        try {
          // Validate required fields
          if (!orderSupplier.id || !orderSupplier.code) {
            console.warn(
              `Skipping order supplier with missing required fields: ${JSON.stringify(
                {
                  id: orderSupplier.id,
                  code: orderSupplier.code,
                }
              )}`
            );
            failCount++;
            continue;
          }

          const validatedOrderSupplier = {
            id: orderSupplier.id,
            code: orderSupplier.code,
            ...orderSupplier,
          };

          // Check if record exists (simplified - no date comparison since we don't have modifiedDate)
          const [existing] = await connection.execute(
            "SELECT id FROM order_suppliers WHERE id = ?",
            [validatedOrderSupplier.id]
          );

          const isNew = existing.length === 0;

          // Always save (either insert new or update existing via ON DUPLICATE KEY UPDATE)
          const result = await saveOrderSupplier(
            validatedOrderSupplier,
            connection
          );
          if (result.success) {
            successCount++;
            if (isNew) newCount++;
            else updatedCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(
            `Error processing order supplier ${orderSupplier.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed order supplier batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(orderSuppliers.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Order supplier sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Order supplier transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: orderSuppliers.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
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
      WHERE entity_type = 'order_suppliers'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('order_suppliers', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating order supplier sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["order_suppliers"]
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
    console.error("Error getting order supplier sync status:", error);
    throw error;
  }
}

module.exports = {
  saveOrderSupplier,
  saveOrderSuppliers,
  updateSyncStatus,
  getSyncStatus,
};
