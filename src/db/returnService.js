// src/db/returnService.js
const { getPool } = require("../db");

/**
 * Save individual return to database
 * Follows the same pattern as saveProduct()
 */
async function saveReturn(returnData, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract main return fields following KiotViet API structure
    const {
      id,
      code,
      invoiceId,
      returnDate,
      branchId,
      branchName,
      receivedById,
      soldByName,
      customerId,
      customerCode,
      customerName,
      returnTotal = 0,
      returnDiscount = 0,
      returnFee = 0,
      totalPayment = 0,
      status,
      statusValue,
      createdDate,
      modifiedDate,
      payments = [],
      returnDetails = [],
    } = returnData;

    // Helper function for safe values (same as your other services)
    const safeValue = (value) =>
      value === undefined || value === null ? null : value;

    // Insert main return record
    const query = `
      INSERT INTO returns 
        (id, code, invoiceId, returnDate, branchId, branchName, 
         receivedById, soldByName, customerId, customerCode, customerName,
         returnTotal, returnDiscount, returnFee, totalPayment, status, statusValue,
         createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        invoiceId = VALUES(invoiceId),
        returnDate = VALUES(returnDate),
        branchId = VALUES(branchId),
        branchName = VALUES(branchName),
        receivedById = VALUES(receivedById),
        soldByName = VALUES(soldByName),
        customerId = VALUES(customerId),
        customerCode = VALUES(customerCode),
        customerName = VALUES(customerName),
        returnTotal = VALUES(returnTotal),
        returnDiscount = VALUES(returnDiscount),
        returnFee = VALUES(returnFee),
        totalPayment = VALUES(totalPayment),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      safeValue(id),
      safeValue(code),
      safeValue(invoiceId),
      safeValue(returnDate),
      safeValue(branchId),
      safeValue(branchName),
      safeValue(receivedById),
      safeValue(soldByName),
      safeValue(customerId),
      safeValue(customerCode),
      safeValue(customerName),
      safeValue(returnTotal),
      safeValue(returnDiscount),
      safeValue(returnFee),
      safeValue(totalPayment),
      safeValue(status),
      safeValue(statusValue),
      safeValue(createdDate),
      safeValue(modifiedDate),
      JSON.stringify(returnData), // Store complete JSON like your other entities
    ]);

    // Handle return details (same pattern as order details, invoice details)
    if (
      returnDetails &&
      Array.isArray(returnDetails) &&
      returnDetails.length > 0
    ) {
      // Delete existing details first
      await connection.execute(
        "DELETE FROM return_details WHERE returnId = ?",
        [id]
      );

      // Insert new details
      for (const detail of returnDetails) {
        try {
          const detailQuery = `
            INSERT INTO return_details 
              (returnId, productId, productCode, productName, quantity, price, note, usePoint, subTotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(detailQuery, [
            safeValue(id),
            safeValue(detail.productId),
            safeValue(detail.productCode),
            safeValue(detail.productName),
            safeValue(detail.quantity || 0),
            safeValue(detail.price || 0),
            safeValue(detail.note),
            safeValue(detail.usePoint || false),
            safeValue(detail.subTotal || 0),
          ]);
        } catch (detailError) {
          console.warn(
            `⚠️ Warning: Could not save return detail for product ${detail.productCode}: ${detailError.message}`
          );
        }
      }
    }

    // Handle payments (same pattern as invoice payments)
    if (payments && Array.isArray(payments) && payments.length > 0) {
      // Delete existing payments first
      await connection.execute(
        "DELETE FROM return_payments WHERE returnId = ?",
        [id]
      );

      // Insert new payments
      for (const payment of payments) {
        try {
          const paymentQuery = `
            INSERT INTO return_payments 
              (id, returnId, code, amount, method, status, statusValue, transDate, bankAccount, accountId, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(paymentQuery, [
            safeValue(payment.id),
            safeValue(id),
            safeValue(payment.code),
            safeValue(payment.amount || 0),
            safeValue(payment.method),
            safeValue(payment.status),
            safeValue(payment.statusValue),
            safeValue(payment.transDate),
            safeValue(payment.bankAccount),
            safeValue(payment.accountId),
            safeValue(payment.description),
          ]);
        } catch (paymentError) {
          console.warn(
            `⚠️ Warning: Could not save return payment ${payment.code}: ${paymentError.message}`
          );
        }
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error saving return ${returnData.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple returns to database
 * Follows the same pattern as saveProducts()
 */
async function saveReturns(returnsArray) {
  if (!Array.isArray(returnsArray) || returnsArray.length === 0) {
    return {
      success: true,
      stats: { success: 0, failed: 0, newRecords: 0 },
    };
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  let successCount = 0;
  let failedCount = 0;

  try {
    console.log(`📦 Processing ${returnsArray.length} returns...`);

    for (const returnData of returnsArray) {
      try {
        const result = await saveReturn(returnData, connection);
        if (result.success) {
          successCount++;
        } else {
          failedCount++;
          console.error(
            `❌ Failed to save return ${returnData.code}: ${result.error}`
          );
        }
      } catch (error) {
        failedCount++;
        console.error(
          `❌ Error processing return ${returnData.code}:`,
          error.message
        );
      }
    }

    console.log(
      `✅ Returns processing completed: ${successCount} success, ${failedCount} failed`
    );

    return {
      success: true,
      stats: {
        success: successCount,
        failed: failedCount,
        newRecords: successCount, // Treat all successful saves as potential new records
      },
    };
  } catch (error) {
    console.error("❌ Error in saveReturns:", error);
    return {
      success: false,
      stats: { success: successCount, failed: failedCount, newRecords: 0 },
      error: error.message,
    };
  } finally {
    connection.release();
  }
}

/**
 * Update sync status for returns
 * Exactly the same pattern as other entities
 */
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'returns'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('returns', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error updating returns sync status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sync status for returns
 * Exactly the same pattern as other entities
 */
async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["returns"]
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
    console.error("❌ Error getting returns sync status:", error);
    throw error;
  }
}

module.exports = {
  saveReturn,
  saveReturns,
  updateSyncStatus,
  getSyncStatus,
};
