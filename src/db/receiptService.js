// src/db/receiptService.js - FIXED VERSION with foreign key validation
const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizeReceipt(receipt) {
  return {
    ...receipt,
    code: receipt.code ? String(receipt.code).substring(0, 50) : "",
    supplierName: receipt.supplierName
      ? String(receipt.supplierName).substring(0, 255)
      : null,
    branchName: receipt.branchName
      ? String(receipt.branchName).substring(0, 255)
      : null,
    createdByName: receipt.createdByName
      ? String(receipt.createdByName).substring(0, 255)
      : null,
    description: receipt.description
      ? String(receipt.description).substring(0, 1000)
      : null,
    total: isNaN(Number(receipt.total)) ? 0 : Number(receipt.total),
    totalPayment: isNaN(Number(receipt.totalPayment))
      ? 0
      : Number(receipt.totalPayment),
    discount: isNaN(Number(receipt.discount)) ? 0 : Number(receipt.discount),
  };
}

// FIXED: Function to check if foreign key references exist
async function validateForeignKeys(receipt, connection) {
  const validatedData = { ...receipt };

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

  // Check if supplierId exists
  if (validatedData.supplierId) {
    const [supplierExists] = await connection.execute(
      "SELECT id FROM suppliers WHERE id = ?",
      [validatedData.supplierId]
    );
    if (supplierExists.length === 0) {
      console.warn(
        `Supplier ${validatedData.supplierId} not found, setting to null`
      );
      validatedData.supplierId = null;
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

  return validatedData;
}

async function saveReceipts(receipts) {
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
    for (let i = 0; i < receipts.length; i += BATCH_SIZE) {
      const batch = receipts.slice(i, i + BATCH_SIZE);

      for (const receipt of batch) {
        try {
          // Validate and sanitize
          const validatedReceipt = validateAndSanitizeReceipt(receipt);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM receipts WHERE id = ?",
            [validatedReceipt.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedReceipt.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedReceipt.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveReceipt(validatedReceipt, connection);
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
            `Error processing receipt ${receipt.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed receipt batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          receipts.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Receipt sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Receipt transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: receipts.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// FIXED: Update saveReceipt to accept connection parameter and validate foreign keys
async function saveReceipt(receipt, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Validate foreign keys before insertion
    const validatedReceipt = await validateForeignKeys(receipt, connection);

    // FIXED: Extract and convert undefined to null
    const id = convertUndefinedToNull(validatedReceipt.id);
    const code = convertUndefinedToNull(validatedReceipt.code) || "";
    const receiptDate = convertUndefinedToNull(validatedReceipt.receiptDate);
    const branchId = convertUndefinedToNull(validatedReceipt.branchId);
    const branchName = convertUndefinedToNull(validatedReceipt.branchName);
    const supplierId = convertUndefinedToNull(validatedReceipt.supplierId);
    const supplierName = convertUndefinedToNull(validatedReceipt.supplierName);
    const createdById = convertUndefinedToNull(validatedReceipt.createdById);
    const createdByName = convertUndefinedToNull(
      validatedReceipt.createdByName
    );
    const status = convertUndefinedToNull(validatedReceipt.status);
    const statusValue = convertUndefinedToNull(validatedReceipt.statusValue);
    const total = convertUndefinedToNull(validatedReceipt.total);
    const totalPayment = convertUndefinedToNull(validatedReceipt.totalPayment);
    const discount = convertUndefinedToNull(validatedReceipt.discount);
    const description = convertUndefinedToNull(validatedReceipt.description);
    const retailerId = convertUndefinedToNull(validatedReceipt.retailerId);
    const createdDate = convertUndefinedToNull(validatedReceipt.createdDate);
    const modifiedDate = convertUndefinedToNull(validatedReceipt.modifiedDate);

    const jsonData = JSON.stringify(receipt);

    const query = `
      INSERT INTO receipts 
        (id, code, receiptDate, branchId, branchName, supplierId, supplierName, 
         createdById, createdByName, status, statusValue, total, totalPayment,
         discount, description, retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        receiptDate = VALUES(receiptDate),
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
      receiptDate,
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

    // Handle receipt details if present
    if (receipt.receiptDetails && Array.isArray(receipt.receiptDetails)) {
      await connection.execute(
        "DELETE FROM receipt_details WHERE receiptId = ?",
        [id]
      );

      for (const detail of receipt.receiptDetails) {
        const detailQuery = `
          INSERT INTO receipt_details 
            (receiptId, productId, productCode, productName, quantity, 
             price, discount, discountRatio, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving receipt ${receipt.code}:`, error);
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
      WHERE entity_type = 'receipts'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('receipts', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating receipt sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["receipts"]
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
    console.error("Error getting receipt sync status:", error);
    throw error;
  }
}

module.exports = {
  saveReceipt,
  saveReceipts,
  updateSyncStatus,
  getSyncStatus,
};
