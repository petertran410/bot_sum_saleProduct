// src/db/returnService.js - FIXED VERSION with proper foreign key handling
const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizeReturn(returnOrder) {
  return {
    ...returnOrder,
    code: returnOrder.code ? String(returnOrder.code).substring(0, 50) : "",
    customerName: returnOrder.customerName
      ? String(returnOrder.customerName).substring(0, 255)
      : null,
    branchName: returnOrder.branchName
      ? String(returnOrder.branchName).substring(0, 255)
      : null,
    createdByName: returnOrder.createdByName
      ? String(returnOrder.createdByName).substring(0, 255)
      : null,
    description: returnOrder.description
      ? String(returnOrder.description).substring(0, 1000)
      : null,
    total: isNaN(Number(returnOrder.total)) ? 0 : Number(returnOrder.total),
    totalPayment: isNaN(Number(returnOrder.totalPayment))
      ? 0
      : Number(returnOrder.totalPayment),
    discount: isNaN(Number(returnOrder.discount))
      ? 0
      : Number(returnOrder.discount),
  };
}

// FIXED: Function to check if foreign key references exist
async function validateForeignKeys(returnOrder, connection) {
  const validatedData = { ...returnOrder };

  // Check if branchId exists
  if (validatedData.branchId) {
    const [branchExists] = await connection.execute(
      "SELECT id FROM branches WHERE id = ?",
      [validatedData.branchId]
    );
    if (branchExists.length === 0) {
      console.warn(
        `Branch ${validatedData.branchId} not found, setting to null`
      );
      validatedData.branchId = null;
    }
  }

  // Check if customerId exists
  if (validatedData.customerId) {
    const [customerExists] = await connection.execute(
      "SELECT id FROM customers WHERE id = ?",
      [validatedData.customerId]
    );
    if (customerExists.length === 0) {
      console.warn(
        `Customer ${validatedData.customerId} not found, setting to null`
      );
      validatedData.customerId = null;
    }
  }

  // Check if createdById exists
  if (validatedData.createdById) {
    const [userExists] = await connection.execute(
      "SELECT id FROM users WHERE id = ?",
      [validatedData.createdById]
    );
    if (userExists.length === 0) {
      console.warn(
        `User ${validatedData.createdById} not found, setting to null`
      );
      validatedData.createdById = null;
    }
  }

  // Check if invoiceId exists
  if (validatedData.invoiceId) {
    const [invoiceExists] = await connection.execute(
      "SELECT id FROM invoices WHERE id = ?",
      [validatedData.invoiceId]
    );
    if (invoiceExists.length === 0) {
      console.warn(
        `Invoice ${validatedData.invoiceId} not found, setting to null`
      );
      validatedData.invoiceId = null;
    }
  }

  return validatedData;
}

async function saveReturns(returns) {
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
    for (let i = 0; i < returns.length; i += BATCH_SIZE) {
      const batch = returns.slice(i, i + BATCH_SIZE);

      for (const returnOrder of batch) {
        try {
          // Validate and sanitize
          const validatedReturn = validateAndSanitizeReturn(returnOrder);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM returns WHERE id = ?",
            [validatedReturn.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedReturn.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedReturn.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveReturn(validatedReturn, connection);
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
            `Error processing return ${returnOrder.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed return batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          returns.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Return sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Return transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: returns.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveReturn to accept connection parameter
async function saveReturn(returnOrder, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Validate foreign keys before insertion
    const validatedReturn = await validateForeignKeys(returnOrder, connection);

    // FIXED: Extract and convert undefined to null
    const id = convertUndefinedToNull(validatedReturn.id);
    const code = convertUndefinedToNull(validatedReturn.code) || "";
    const returnDate = convertUndefinedToNull(validatedReturn.returnDate);
    const branchId = convertUndefinedToNull(validatedReturn.branchId);
    const branchName = convertUndefinedToNull(validatedReturn.branchName);
    const customerId = convertUndefinedToNull(validatedReturn.customerId);
    const customerName = convertUndefinedToNull(validatedReturn.customerName);
    const createdById = convertUndefinedToNull(validatedReturn.createdById);
    const createdByName = convertUndefinedToNull(validatedReturn.createdByName);
    const status = convertUndefinedToNull(validatedReturn.status);
    const statusValue = convertUndefinedToNull(validatedReturn.statusValue);
    const total = convertUndefinedToNull(validatedReturn.total);
    const totalPayment = convertUndefinedToNull(validatedReturn.totalPayment);
    const discount = convertUndefinedToNull(validatedReturn.discount);
    const description = convertUndefinedToNull(validatedReturn.description);
    const invoiceId = convertUndefinedToNull(validatedReturn.invoiceId);
    const invoiceCode = convertUndefinedToNull(validatedReturn.invoiceCode);
    const retailerId = convertUndefinedToNull(validatedReturn.retailerId);
    const createdDate = convertUndefinedToNull(validatedReturn.createdDate);
    const modifiedDate = convertUndefinedToNull(validatedReturn.modifiedDate);

    const jsonData = JSON.stringify(returnOrder);

    const query = `
      INSERT INTO returns 
        (id, code, returnDate, branchId, branchName, customerId, customerName, 
         createdById, createdByName, status, statusValue, total, totalPayment,
         discount, description, invoiceId, invoiceCode, retailerId, 
         createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        returnDate = VALUES(returnDate),
        branchName = VALUES(branchName),
        customerName = VALUES(customerName),
        createdByName = VALUES(createdByName),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        total = VALUES(total),
        totalPayment = VALUES(totalPayment),
        discount = VALUES(discount),
        description = VALUES(description),
        invoiceCode = VALUES(invoiceCode),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      returnDate,
      branchId,
      branchName,
      customerId,
      customerName,
      createdById,
      createdByName,
      status,
      statusValue,
      total,
      totalPayment,
      discount,
      description,
      invoiceId,
      invoiceCode,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle return details if present
    if (returnOrder.returnDetails && Array.isArray(returnOrder.returnDetails)) {
      await connection.execute(
        "DELETE FROM return_details WHERE returnId = ?",
        [id]
      );

      for (const detail of returnOrder.returnDetails) {
        const detailQuery = `
          INSERT INTO return_details 
            (returnId, productId, productCode, productName, quantity, 
             price, discount, discountRatio, note, returnReason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          convertUndefinedToNull(detail.productId),
          convertUndefinedToNull(detail.productCode),
          convertUndefinedToNull(detail.productName),
          convertUndefinedToNull(detail.quantity) || 0,
          convertUndefinedToNull(detail.price) || 0,
          convertUndefinedToNull(detail.discount) || 0,
          convertUndefinedToNull(detail.discountRatio) || 0,
          convertUndefinedToNull(detail.note),
          convertUndefinedToNull(detail.returnReason),
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving return ${returnOrder.code}:`, error);
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
    console.error("Error updating return sync status:", error);
    return { success: false, error: error.message };
  }
}

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
    console.error("Error getting return sync status:", error);
    throw error;
  }
}

module.exports = {
  saveReturn,
  saveReturns,
  updateSyncStatus,
  getSyncStatus,
};
