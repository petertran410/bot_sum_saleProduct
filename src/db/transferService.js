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
    from_branch_id: transfer.fromBranchId
      ? Number(transfer.fromBranchId)
      : null,
    to_branch_id: transfer.toBranchId ? Number(transfer.toBranchId) : null,
    created_by_id: transfer.createdById ? Number(transfer.createdById) : null,
    retailer_id: transfer.retailerId ? Number(transfer.retailerId) : null,
    is_active: transfer.isActive !== undefined ? transfer.isActive : true,
    // Handle multiple date field names from actual KiotViet response
    transferred_date:
      transfer.transferredDate || transfer.dispatchedDate || null,
    received_date: transfer.receivedDate || null,
    created_date: transfer.createdDate || new Date(),
    modified_date: transfer.modifiedDate || new Date(),
    // Handle name fields
    from_branch_name: transfer.fromBranchName || null,
    to_branch_name: transfer.toBranchName || null,
    created_by_name: transfer.createdByName || null,
    note_by_source: transfer.noteBySource || null,
    note_by_destination: transfer.noteByDestination || null,
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
      transferred_date,
      received_date,
      created_by_id,
      created_by_name,
      from_branch_id,
      from_branch_name,
      to_branch_id,
      to_branch_name,
      note_by_source,
      note_by_destination,
      description,
      retailer_id,
      created_date,
      modified_date,
      is_active,
    } = validatedTransfer;

    if (!id || !code) {
      throw new Error("Transfer ID and code are required");
    }

    // Check if transfer already exists using correct column name
    const [existing] = await connection.execute(
      "SELECT id, modified_date FROM transfers WHERE id = ?",
      [id]
    );

    const jsonData = JSON.stringify(transfer);

    // Insert or update main transfer record using correct column names
    const query = `
      INSERT INTO transfers 
        (id, code, status, transferred_date, received_date, created_by_id, created_by_name,
         from_branch_id, from_branch_name, to_branch_id, to_branch_name, note_by_source, 
         note_by_destination, description, retailer_id, created_date, modified_date, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        status = VALUES(status),
        transferred_date = VALUES(transferred_date),
        received_date = VALUES(received_date),
        created_by_id = VALUES(created_by_id),
        created_by_name = VALUES(created_by_name),
        from_branch_id = VALUES(from_branch_id),
        from_branch_name = VALUES(from_branch_name),
        to_branch_id = VALUES(to_branch_id),
        to_branch_name = VALUES(to_branch_name),
        note_by_source = VALUES(note_by_source),
        note_by_destination = VALUES(note_by_destination),
        description = VALUES(description),
        modified_date = VALUES(modified_date),
        is_active = VALUES(is_active)
    `;

    await connection.execute(query, [
      safeValue(id),
      safeValue(code),
      safeValue(status),
      safeValue(transferred_date),
      safeValue(received_date),
      safeValue(created_by_id),
      safeValue(created_by_name),
      safeValue(from_branch_id),
      safeValue(from_branch_name),
      safeValue(to_branch_id),
      safeValue(to_branch_name),
      safeValue(note_by_source),
      safeValue(note_by_destination),
      safeValue(description),
      safeValue(retailer_id),
      safeValue(created_date),
      safeValue(modified_date),
      safeValue(is_active),
    ]);

    // Handle transferDetails from actual KiotViet response structure
    const detailsArray = transfer.transferDetails || transfer.details || [];

    if (
      detailsArray &&
      Array.isArray(detailsArray) &&
      detailsArray.length > 0
    ) {
      // Delete existing details first - using correct column name
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

    for (const transfer of transfers) {
      try {
        const validatedTransfer = validateAndSanitizeTransfer(transfer);
        const { id } = validatedTransfer;

        if (!id) {
          console.warn("Skipping transfer without ID");
          failCount++;
          continue;
        }

        // Check if transfer exists using correct column name
        const [existing] = await connection.execute(
          "SELECT id, modified_date FROM transfers WHERE id = ?",
          [id]
        );

        const isNew = existing.length === 0;
        let isUpdated = false;

        if (!isNew && validatedTransfer.modified_date) {
          isUpdated =
            new Date(validatedTransfer.modified_date) >
            new Date(existing[0].modified_date);
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
