const { getPool } = require("../db.js");

// Add data validation and sanitization
function validateAndSanitizeTransfer(transfer) {
  return {
    ...transfer,
    id: transfer.id ? Number(transfer.id) : null,
    code: transfer.code ? String(transfer.code).substring(0, 50) : "",
    status: isNaN(Number(transfer.status)) ? 0 : Number(transfer.status),
    description: transfer.description
      ? String(transfer.description).substring(0, 1000)
      : "",
    fromBranchId: transfer.fromBranchId ? Number(transfer.fromBranchId) : null,
    toBranchId: transfer.toBranchId ? Number(transfer.toBranchId) : null,
    createdById: transfer.createdById ? Number(transfer.createdById) : null,
    retailerId: transfer.retailerId ? Number(transfer.retailerId) : null,
    isActive: transfer.isActive !== undefined ? transfer.isActive : true,
    // Handle multiple date field names from actual KiotViet response
    transferredDate:
      transfer.transferredDate || transfer.dispatchedDate || null,
    receivedDate: transfer.receivedDate || null,
    createdDate: transfer.createdDate || new Date(),
    modifiedDate: transfer.modifiedDate || new Date(),
  };
}

async function saveTransfer(transfer, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const validatedTransfer = validateAndSanitizeTransfer(transfer);

    const {
      id,
      code,
      status,
      transferredDate,
      receivedDate,
      createdById,
      createdByName,
      fromBranchId,
      fromBranchName,
      toBranchId,
      toBranchName,
      noteBySource,
      noteByDestination,
      description,
      retailerId,
      createdDate,
      modifiedDate,
    } = validatedTransfer;

    if (!id || !code) {
      throw new Error("Transfer ID and code are required");
    }

    // Check if transfer already exists
    const [existing] = await connection.execute(
      "SELECT id, modifiedDate FROM transfers WHERE id = ?",
      [id]
    );

    const jsonData = JSON.stringify(transfer);

    // Insert or update main transfer record
    const query = `
      INSERT INTO transfers 
        (id, code, status, transferredDate, receivedDate, createdById, createdByName,
         fromBranchId, fromBranchName, toBranchId, toBranchName, noteBySource, 
         noteByDestination, description, retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        status = VALUES(status),
        transferredDate = VALUES(transferredDate),
        receivedDate = VALUES(receivedDate),
        createdById = VALUES(createdById),
        createdByName = VALUES(createdByName),
        fromBranchId = VALUES(fromBranchId),
        fromBranchName = VALUES(fromBranchName),
        toBranchId = VALUES(toBranchId),
        toBranchName = VALUES(toBranchName),
        noteBySource = VALUES(noteBySource),
        noteByDestination = VALUES(noteByDestination),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      status,
      transferredDate,
      receivedDate,
      createdById,
      createdByName,
      fromBranchId,
      fromBranchName,
      toBranchId,
      toBranchName,
      noteBySource,
      noteByDestination,
      description,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle transferDetails from actual KiotViet response structure
    const detailsArray = transfer.transferDetails || transfer.details || [];

    if (
      detailsArray &&
      Array.isArray(detailsArray) &&
      detailsArray.length > 0
    ) {
      // Delete existing details first
      await connection.execute(
        "DELETE FROM transfer_details WHERE transferId = ?",
        [id]
      );

      // Insert new details based on actual KiotViet response structure
      for (const detail of detailsArray) {
        try {
          const detailQuery = `
            INSERT INTO transfer_details 
              (transferId, productId, productCode, productName, 
               transferredQuantity, price, sendQuantity, receiveQuantity,
               sendPrice, receivePrice, totalTransfer, totalReceive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(detailQuery, [
            id,
            detail.productId || null,
            detail.productCode || null,
            detail.productName || null,
            detail.transferredQuantity || detail.sendQuantity || 0,
            detail.price || 0,
            detail.sendQuantity || 0,
            detail.receiveQuantity || 0,
            detail.sendPrice || 0,
            detail.receivePrice || 0,
            detail.totalTransfer || detail.sendPrice || 0,
            detail.totalReceive || detail.receivePrice || 0,
          ]);
        } catch (detailError) {
          console.warn(
            `Warning: Could not save transfer detail for transfer ${id}: ${detailError.message}`
          );
        }
      }
    }

    return {
      success: true,
      isNew: existing.length === 0,
      transferId: id,
    };
  } catch (error) {
    console.error(
      `Error saving transfer ${transfer.code || transfer.id}:`,
      error
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// Enhanced batch save function (same as product sync pattern)
async function saveTransfers(transfers) {
  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  try {
    await connection.beginTransaction();

    for (const transfer of transfers) {
      try {
        const result = await saveTransfer(transfer, connection);

        if (result.success) {
          successCount++;
          if (result.isNew) {
            newCount++;
          } else {
            updatedCount++;
          }
        } else {
          failCount++;
          console.error(
            `Failed to save transfer ${transfer.code || transfer.id}:`,
            result.error
          );
        }
      } catch (error) {
        failCount++;
        console.error(
          `Exception saving transfer ${transfer.code || transfer.id}:`,
          error.message
        );
      }
    }

    await connection.commit();

    console.log(
      `Transfer batch save completed: ${successCount} success, ${failCount} failed, ${newCount} new, ${updatedCount} updated`
    );

    return {
      success: true,
      stats: {
        total: transfers.length,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updatedRecords: updatedCount,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Transfer batch save failed:", error);
    return {
      success: false,
      error: error.message,
      stats: {
        total: transfers.length,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updatedRecords: updatedCount,
      },
    };
  } finally {
    connection.release();
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
      WHERE entity_type = 'transfers'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('transfers', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating transfer sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["transfers"]
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
    console.error("Error getting transfer sync status:", error);
    throw error;
  }
}

module.exports = {
  saveTransfer,
  saveTransfers,
  updateSyncStatus,
  getSyncStatus,
};
