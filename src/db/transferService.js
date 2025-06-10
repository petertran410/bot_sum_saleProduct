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

// Function to check table structure and get correct column names
async function getTransferDetailsColumns(connection) {
  try {
    const [columns] = await connection.execute(
      "SHOW COLUMNS FROM transfer_details"
    );
    const columnNames = columns.map((col) => col.Field.toLowerCase());

    // Determine the correct column mapping
    const columnMap = {
      id: columnNames.includes("id") ? "id" : null,
      transfer_id: columnNames.includes("transfer_id")
        ? "transfer_id"
        : columnNames.includes("transferid")
        ? "transferId"
        : "transfer_id",
      product_id: columnNames.includes("product_id")
        ? "product_id"
        : columnNames.includes("productid")
        ? "productId"
        : "product_id",
      product_code: columnNames.includes("product_code")
        ? "product_code"
        : columnNames.includes("productcode")
        ? "productCode"
        : "product_code",
      product_name: columnNames.includes("product_name")
        ? "product_name"
        : columnNames.includes("productname")
        ? "productName"
        : "product_name",
      transferred_quantity: columnNames.includes("transferred_quantity")
        ? "transferred_quantity"
        : columnNames.includes("transferredquantity")
        ? "transferredQuantity"
        : "transferred_quantity",
      price: "price",
      send_quantity: columnNames.includes("send_quantity")
        ? "send_quantity"
        : columnNames.includes("sendquantity")
        ? "sendQuantity"
        : "send_quantity",
      receive_quantity: columnNames.includes("receive_quantity")
        ? "receive_quantity"
        : columnNames.includes("receivequantity")
        ? "receiveQuantity"
        : "receive_quantity",
      send_price: columnNames.includes("send_price")
        ? "send_price"
        : columnNames.includes("sendprice")
        ? "sendPrice"
        : "send_price",
      receive_price: columnNames.includes("receive_price")
        ? "receive_price"
        : columnNames.includes("receiveprice")
        ? "receivePrice"
        : "receive_price",
      total_transfer: columnNames.includes("total_transfer")
        ? "total_transfer"
        : columnNames.includes("totaltransfer")
        ? "totalTransfer"
        : "total_transfer",
      total_receive: columnNames.includes("total_receive")
        ? "total_receive"
        : columnNames.includes("totalreceive")
        ? "totalReceive"
        : "total_receive",
    };

    // Check if id column has AUTO_INCREMENT
    const idColumn = columns.find((col) => col.Field.toLowerCase() === "id");
    const hasAutoIncrement =
      idColumn && idColumn.Extra.includes("auto_increment");

    return { columnMap, hasAutoIncrement };
  } catch (error) {
    console.error("Error checking transfer_details columns:", error);
    // Fallback to underscore naming
    return {
      columnMap: {
        id: "id",
        transfer_id: "transfer_id",
        product_id: "product_id",
        product_code: "product_code",
        product_name: "product_name",
        transferred_quantity: "transferred_quantity",
        price: "price",
        send_quantity: "send_quantity",
        receive_quantity: "receive_quantity",
        send_price: "send_price",
        receive_price: "receive_price",
        total_transfer: "total_transfer",
        total_receive: "total_receive",
      },
      hasAutoIncrement: true,
    };
  }
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
      // Get correct column names for transfer_details table
      const { columnMap, hasAutoIncrement } = await getTransferDetailsColumns(
        connection
      );

      // Delete existing details first
      await connection.execute(
        `DELETE FROM transfer_details WHERE ${columnMap.transfer_id} = ?`,
        [id]
      );

      // Insert new details based on actual KiotViet response structure
      for (const detail of detailsArray) {
        try {
          // Build dynamic query based on table structure
          let insertColumns = [];
          let insertValues = [];
          let insertParams = [];

          // Only include id if it doesn't have AUTO_INCREMENT
          if (!hasAutoIncrement && columnMap.id) {
            insertColumns.push(columnMap.id);
            insertValues.push("?");
            insertParams.push(null); // Let database handle it
          }

          // Add all other columns
          const columnData = [
            { col: columnMap.transfer_id, val: id },
            { col: columnMap.product_id, val: safeValue(detail.productId) },
            { col: columnMap.product_code, val: safeValue(detail.productCode) },
            { col: columnMap.product_name, val: safeValue(detail.productName) },
            {
              col: columnMap.transferred_quantity,
              val: safeValue(
                detail.transferredQuantity || detail.quantity || 0
              ),
            },
            { col: columnMap.price, val: safeValue(detail.price || 0) },
            {
              col: columnMap.send_quantity,
              val: safeValue(
                detail.sendQuantity || detail.transferredQuantity || 0
              ),
            },
            {
              col: columnMap.receive_quantity,
              val: safeValue(
                detail.receiveQuantity || detail.receivedQuantity || 0
              ),
            },
            {
              col: columnMap.send_price,
              val: safeValue(detail.sendPrice || detail.price || 0),
            },
            {
              col: columnMap.receive_price,
              val: safeValue(detail.receivePrice || detail.price || 0),
            },
            {
              col: columnMap.total_transfer,
              val: safeValue(detail.totalTransfer || 0),
            },
            {
              col: columnMap.total_receive,
              val: safeValue(detail.totalReceive || 0),
            },
          ];

          columnData.forEach((item) => {
            insertColumns.push(item.col);
            insertValues.push("?");
            insertParams.push(item.val);
          });

          const detailQuery = `
            INSERT INTO transfer_details 
              (${insertColumns.join(", ")})
            VALUES (${insertValues.join(", ")})
          `;

          await connection.execute(detailQuery, insertParams);
        } catch (detailError) {
          console.warn(
            `Warning: Could not save transfer detail for transfer ${id}: ${detailError.message}`
          );
          // Log more details for debugging
          console.warn("Detail data:", detail);
          console.warn(
            "Column mapping:",
            await getTransferDetailsColumns(connection)
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
