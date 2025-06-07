const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizePurchaseOrder(purchaseOrder) {
  return {
    ...purchaseOrder,
    code: purchaseOrder.code ? String(purchaseOrder.code).substring(0, 50) : "",
    supplierName: purchaseOrder.supplierName
      ? String(purchaseOrder.supplierName).substring(0, 255)
      : null,
    branchName: purchaseOrder.branchName
      ? String(purchaseOrder.branchName).substring(0, 255)
      : null,
    createdByName: purchaseOrder.createdByName
      ? String(purchaseOrder.createdByName).substring(0, 255)
      : null,
    description: purchaseOrder.description
      ? String(purchaseOrder.description).substring(0, 1000)
      : null,
    total: isNaN(Number(purchaseOrder.total)) ? 0 : Number(purchaseOrder.total),
    totalPayment: isNaN(Number(purchaseOrder.totalPayment))
      ? 0
      : Number(purchaseOrder.totalPayment),
    discount: isNaN(Number(purchaseOrder.discount))
      ? 0
      : Number(purchaseOrder.discount),
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
            existing[0].modifiedDate &&
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

// Update savePurchaseOrder to accept connection parameter
async function savePurchaseOrder(purchaseOrder, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      code,
      purchaseDate,
      expectedDeliveryDate = null,
      branchId = null,
      branchName = null,
      supplierId = null,
      supplierName = null,
      createdById = null,
      createdByName = null,
      status = null,
      statusValue = null,
      total = null,
      totalPayment = null,
      discount = null,
      description = null,
      retailerId,
      createdDate = null,
      modifiedDate = null,
    } = purchaseOrder;

    const jsonData = JSON.stringify(purchaseOrder);

    const query = `
      INSERT INTO purchase_orders 
        (id, code, purchaseDate, expectedDeliveryDate, branchId, branchName, 
         supplierId, supplierName, createdById, createdByName, status, statusValue,
         total, totalPayment, discount, description, retailerId, 
         createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        purchaseDate = VALUES(purchaseDate),
        expectedDeliveryDate = VALUES(expectedDeliveryDate),
        branchName = VALUES(branchName),
        supplierName = VALUES(supplierName),
        createdByName = VALUES(createdByName),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        total = VALUES(total),
        totalPayment = VALUES(totalPayment),
        discount = VALUES(discount),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      purchaseDate,
      expectedDeliveryDate,
      branchId,
      branchName,
      supplierId,
      supplierName,
      createdById,
      createdByName,
      status,
      statusValue,
      total,
      totalPayment,
      discount,
      description,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle purchase order details if present
    if (
      purchaseOrder.purchaseOrderDetails &&
      Array.isArray(purchaseOrder.purchaseOrderDetails)
    ) {
      await connection.execute(
        "DELETE FROM purchase_order_details WHERE purchaseOrderId = ?",
        [id]
      );

      for (const detail of purchaseOrder.purchaseOrderDetails) {
        const detailQuery = `
          INSERT INTO purchase_order_details 
            (purchaseOrderId, productId, productCode, productName, quantity, 
             price, discount, discountRatio, note, receivedQuantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          detail.productId,
          detail.productCode,
          detail.productName,
          detail.quantity || 0,
          detail.price || 0,
          detail.discount || 0,
          detail.discountRatio || 0,
          detail.note || null,
          detail.receivedQuantity || 0,
        ]);
      }
    }

    // Handle purchase order payments if present
    if (purchaseOrder.payments && Array.isArray(purchaseOrder.payments)) {
      await connection.execute(
        "DELETE FROM purchase_order_payments WHERE purchaseOrderId = ?",
        [id]
      );

      for (const payment of purchaseOrder.payments) {
        const paymentQuery = `
          INSERT INTO purchase_order_payments 
            (id, purchaseOrderId, amount, method, accountId, 
             status, statusValue, transDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(paymentQuery, [
          payment.id,
          id,
          payment.amount || 0,
          payment.method || null,
          payment.accountId || null,
          payment.status || 0,
          payment.statusValue || null,
          payment.transDate || null,
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving purchase order ${purchaseOrder.code}:`, error);
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
