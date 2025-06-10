const { getPool } = require("../db.js");

const safeValue = (value) => {
  return value === undefined ? null : value;
};

// Add data validation and sanitization
function validateAndSanitizeTransfer(transfer) {
  return {
    ...transfer,
    id: transfer.id ? Number(transfer.id) : null,
    code: transfer.code ? String(transfer.code).substring(0, 100) : "",
    status: isNaN(Number(transfer.status)) ? 0 : Number(transfer.status),
    description: transfer.description
      ? String(transfer.description).substring(0, 1000)
      : "",
    fromBranchId: transfer.fromBranchId ? Number(transfer.fromBranchId) : null,
    toBranchId: transfer.toBranchId ? Number(transfer.toBranchId) : null,
    createdById: transfer.createdById ? Number(transfer.createdById) : null,
    retailerId: transfer.retailerId ? Number(transfer.retailerId) : null,
    // Handle multiple date field names from actual KiotViet response
    transferredDate:
      transfer.transferredDate || transfer.dispatchedDate || null,
    receivedDate: transfer.receivedDate || null,
    createdDate: transfer.createdDate || new Date(),
    modifiedDate: transfer.modifiedDate || new Date(),
    // Handle name fields
    fromBranchName: transfer.fromBranchName || null,
    toBranchName: transfer.toBranchName || null,
    createdByName: transfer.createdByName || null,
    noteBySource: transfer.noteBySource || null,
    noteByDestination: transfer.noteByDestination || null,
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

    // Insert or update main transfer record using the ACTUAL database column names
    const query = `
      INSERT INTO transfers 
        (id, code, status, transferredDate, receivedDate, createdById, createdByName,
         fromBranchId, fromBranchName, toBranchId, toBranchName, noteBySource, 
         noteByDestination, description, retailerId, createdDate, modifiedDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        modifiedDate = VALUES(modifiedDate)
    `;

    await connection.execute(query, [
      safeValue(id),
      safeValue(code),
      safeValue(status),
      safeValue(transferredDate),
      safeValue(receivedDate),
      safeValue(createdById),
      safeValue(createdByName),
      safeValue(fromBranchId),
      safeValue(fromBranchName),
      safeValue(toBranchId),
      safeValue(toBranchName),
      safeValue(noteBySource),
      safeValue(noteByDestination),
      safeValue(description),
      safeValue(retailerId),
      safeValue(createdDate),
      safeValue(modifiedDate),
    ]);

    // Handle transferDetails from actual KiotViet response structure
    const detailsArray = transfer.transferDetails || transfer.details || [];

    if (
      detailsArray &&
      Array.isArray(detailsArray) &&
      detailsArray.length > 0
    ) {
      // Delete existing details first using ACTUAL column name
      await connection.execute(
        "DELETE FROM transfer_details WHERE transferId = ?",
        [id]
      );

      // Insert new details using ACTUAL database column names (camelCase)
      for (const detail of detailsArray) {
        try {
          const detailQuery = `
            INSERT INTO transfer_details 
              (transferId, productId, productCode, productName, transferredQuantity, 
               price, sendQuantity, receiveQuantity, sendPrice, receivePrice, 
               totalTransfer, totalReceive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(detailQuery, [
            id, // transferId
            safeValue(detail.productId),
            safeValue(detail.productCode),
            safeValue(detail.productName),
            safeValue(detail.transferredQuantity || detail.quantity || 0),
            safeValue(detail.price || 0),
            safeValue(detail.sendQuantity || detail.transferredQuantity || 0),
            safeValue(detail.receiveQuantity || detail.receivedQuantity || 0),
            safeValue(detail.sendPrice || detail.price || 0),
            safeValue(detail.receivePrice || detail.price || 0),
            safeValue(detail.totalTransfer || 0),
            safeValue(detail.totalReceive || 0),
          ]);
        } catch (detailError) {
          console.warn(
            `Warning: Could not save transfer detail for transfer ${id}: ${detailError.message}`
          );
          console.warn("Detail data:", detail);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to save transfer ${transfer.code}:`, error.message);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

async function saveTransfers(transfers) {
  if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
    return {
      success: true,
      stats: {
        total: 0,
        success: 0,
        failed: 0,
        newRecords: 0,
        updatedRecords: 0,
      },
    };
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  try {
    await connection.beginTransaction();

    const BATCH_SIZE = 50;
    for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
      const batch = transfers.slice(i, i + BATCH_SIZE);

      for (const transfer of batch) {
        try {
          const validatedTransfer = validateAndSanitizeTransfer(transfer);
          const { id } = validatedTransfer;

          if (!id) {
            console.warn("Skipping transfer without ID");
            failCount++;
            continue;
          }

          // Check if transfer exists using ACTUAL column name
          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM transfers WHERE id = ?",
            [id]
          );

          const isNew = existing.length === 0;
          let isUpdated = false;

          if (!isNew && validatedTransfer.modifiedDate) {
            isUpdated =
              new Date(validatedTransfer.modifiedDate) >
              new Date(existing[0].modifiedDate);
          } else if (!isNew) {
            isUpdated = true; // Update if no modified_date comparison possible
          }

          if (isNew || isUpdated) {
            const result = await saveTransfer(validatedTransfer, connection);
            if (result.success) {
              successCount++;
              if (isNew) newCount++;
              else updatedCount++;
            } else {
              console.error(
                `Failed to save transfer ${transfer.code}:`,
                result.error
              );
              failCount++;
            }
          }
        } catch (error) {
          console.error(
            `Error processing transfer ${transfer.code || transfer.id}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed transfer batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          transfers.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();

    console.log(
      `Transfer sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );

    return {
      success: failCount === 0,
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
