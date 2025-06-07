const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeTransfer(transfer) {
  return {
    ...transfer,
    code: transfer.code ? String(transfer.code).substring(0, 50) : "",
    description: transfer.description
      ? String(transfer.description).substring(0, 1000)
      : null,
    fromBranchName: transfer.fromBranchName
      ? String(transfer.fromBranchName).substring(0, 255)
      : null,
    toBranchName: transfer.toBranchName
      ? String(transfer.toBranchName).substring(0, 255)
      : null,
    transferByName: transfer.transferByName
      ? String(transfer.transferByName).substring(0, 255)
      : null,
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
      transferDate,
      fromBranchId = null,
      fromBranchName = null,
      toBranchId = null,
      toBranchName = null,
      transferById = null,
      transferByName = null,
      status = null,
      statusValue = null,
      description = null,
      createdDate = null,
      modifiedDate = null,
      retailerId,
    } = transfer;

    const jsonData = JSON.stringify(transfer);

    const query = `
      INSERT INTO transfers 
        (id, code, transferDate, fromBranchId, fromBranchName, toBranchId, 
         toBranchName, transferById, transferByName, status, statusValue, 
         description, createdDate, modifiedDate, retailerId, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        transferDate = VALUES(transferDate),
        fromBranchName = VALUES(fromBranchName),
        toBranchName = VALUES(toBranchName),
        transferByName = VALUES(transferByName),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      transferDate,
      fromBranchId,
      fromBranchName,
      toBranchId,
      toBranchName,
      transferById,
      transferByName,
      status,
      statusValue,
      description,
      createdDate,
      modifiedDate,
      retailerId,
      jsonData,
    ]);

    // Handle transfer details if present
    if (transfer.transferDetails && Array.isArray(transfer.transferDetails)) {
      await connection.execute(
        "DELETE FROM transfer_details WHERE transferId = ?",
        [id]
      );

      for (const detail of transfer.transferDetails) {
        const detailQuery = `
          INSERT INTO transfer_details 
            (transferId, productId, productCode, productName, quantity, 
             transferQuantity, cost, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          detail.productId,
          detail.productCode,
          detail.productName,
          detail.quantity || 0,
          detail.transferQuantity || 0,
          detail.cost || 0,
          detail.note || null,
        ]);
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

// Keep existing updateSyncStatus and getSyncStatus functions
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
