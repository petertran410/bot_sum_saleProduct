const { getPool } = require("../db.js");

// Add data validation and sanitization
function validateAndSanitizeTransfer(transfer) {
  return {
    ...transfer,
    code: transfer.code ? String(transfer.code).substring(0, 50) : "",
    status: isNaN(Number(transfer.status)) ? 0 : Number(transfer.status),
    description: transfer.description
      ? String(transfer.description).substring(0, 1000)
      : "",
    noteBySource: transfer.noteBySource
      ? String(transfer.noteBySource).substring(0, 1000)
      : "",
    noteByDestination: transfer.noteByDestination
      ? String(transfer.noteByDestination).substring(0, 1000)
      : "",
  };
}

async function saveTransfers(transfers) {
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
    for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
      const batch = transfers.slice(i, i + BATCH_SIZE);

      for (const transfer of batch) {
        try {
          // Validate and sanitize
          const validatedTransfer = validateAndSanitizeTransfer(transfer);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM transfers WHERE id = ?",
            [validatedTransfer.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedTransfer.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedTransfer.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveTransfer(validatedTransfer, connection);
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
            `Error processing transfer ${transfer.code}:`,
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
  } catch (error) {
    await connection.rollback();
    console.error("Transfer transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: transfers.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveTransfer to accept connection parameter
async function saveTransfer(transfer, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      code,
      status = 0,
      transferredDate = null,
      receivedDate = null,
      createdById = null,
      createdByName = null,
      fromBranchId = null,
      fromBranchName = null,
      toBranchId = null,
      toBranchName = null,
      noteBySource = null,
      noteByDestination = null,
      description = null,
      retailerId = null,
      createdDate = null,
      modifiedDate = null,
    } = transfer;

    const jsonData = JSON.stringify(transfer);

    const query = `
      INSERT INTO transfers 
        (id, code, status, transferredDate, receivedDate, createdById, 
         createdByName, fromBranchId, fromBranchName, toBranchId, toBranchName,
         noteBySource, noteByDestination, description, retailerId, 
         createdDate, modifiedDate, jsonData)
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

    // Handle transfer details if present
    if (transfer.details && Array.isArray(transfer.details)) {
      await connection.execute(
        "DELETE FROM transfer_details WHERE transferId = ?",
        [id]
      );

      for (const detail of transfer.details) {
        try {
          const detailQuery = `
            INSERT INTO transfer_details 
              (transferId, detailId, productId, productCode, productName, 
               transferredQuantity, price, totalTransfer, totalReceive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          await connection.execute(detailQuery, [
            id,
            detail.id || null,
            detail.productId || null,
            detail.productCode || null,
            detail.productName || null,
            detail.transferredQuantity || 0,
            detail.price || 0,
            detail.totalTransfer || 0,
            detail.totalReceive || 0,
          ]);
        } catch (detailError) {
          console.warn(
            `Warning: Could not save transfer detail for transfer ${id}: ${detailError.message}`
          );
        }
      }
    }

    // Handle transferDetails (legacy format) if present
    if (transfer.transferDetails && Array.isArray(transfer.transferDetails)) {
      // Only process if details array is empty (to avoid duplicates)
      const [existingDetails] = await connection.execute(
        "SELECT COUNT(*) as count FROM transfer_details WHERE transferId = ?",
        [id]
      );

      if (existingDetails[0].count === 0) {
        for (const detail of transfer.transferDetails) {
          try {
            const detailQuery = `
              INSERT INTO transfer_details 
                (transferId, productId, productCode, transferredQuantity, 
                 price, sendPrice, receivePrice, sendQuantity, receiveQuantity)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(detailQuery, [
              id,
              detail.productId || null,
              detail.ProductCode || detail.productCode || null,
              detail.transferredQuantity || detail.sendQuantity || 0,
              detail.price || 0,
              detail.sendPrice || 0,
              detail.receivePrice || 0,
              detail.sendQuantity || 0,
              detail.recieveQuantity || detail.receiveQuantity || 0,
            ]);
          } catch (detailError) {
            console.warn(
              `Warning: Could not save transfer detail for transfer ${id}: ${detailError.message}`
            );
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving transfer ${transfer.code}:`, error);
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
