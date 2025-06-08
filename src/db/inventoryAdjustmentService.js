// src/db/inventoryAdjustmentService.js - NEW SERVICE
const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizeInventoryAdjustment(adjustment) {
  return {
    ...adjustment,
    code: adjustment.code ? String(adjustment.code).substring(0, 50) : "",
    description: adjustment.description
      ? String(adjustment.description).substring(0, 1000)
      : null,
    branchName: adjustment.branchName
      ? String(adjustment.branchName).substring(0, 255)
      : null,
    createdByName: adjustment.createdByName
      ? String(adjustment.createdByName).substring(0, 255)
      : null,
    reason: adjustment.reason
      ? String(adjustment.reason).substring(0, 255)
      : null,
  };
}

// Function to check if foreign key references exist
async function validateForeignKeys(adjustment, connection) {
  const validatedData = { ...adjustment };

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

async function saveInventoryAdjustments(adjustments) {
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
    for (let i = 0; i < adjustments.length; i += BATCH_SIZE) {
      const batch = adjustments.slice(i, i + BATCH_SIZE);

      for (const adjustment of batch) {
        try {
          // Validate and sanitize
          const validatedAdjustment =
            validateAndSanitizeInventoryAdjustment(adjustment);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM inventory_adjustments WHERE id = ?",
            [validatedAdjustment.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedAdjustment.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedAdjustment.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveInventoryAdjustment(
              validatedAdjustment,
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
            `Error processing inventory adjustment ${adjustment.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed inventory adjustment batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(adjustments.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Inventory adjustment sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Inventory adjustment transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: adjustments.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveInventoryAdjustment to accept connection parameter
async function saveInventoryAdjustment(adjustment, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // Validate foreign keys before insertion
    const validatedAdjustment = await validateForeignKeys(
      adjustment,
      connection
    );

    // Extract and convert undefined to null
    const id = convertUndefinedToNull(validatedAdjustment.id);
    const code = convertUndefinedToNull(validatedAdjustment.code) || "";
    const adjustmentDate = convertUndefinedToNull(
      validatedAdjustment.adjustmentDate
    );
    const branchId = convertUndefinedToNull(validatedAdjustment.branchId);
    const branchName = convertUndefinedToNull(validatedAdjustment.branchName);
    const createdById = convertUndefinedToNull(validatedAdjustment.createdById);
    const createdByName = convertUndefinedToNull(
      validatedAdjustment.createdByName
    );
    const type = convertUndefinedToNull(validatedAdjustment.type);
    const typeValue = convertUndefinedToNull(validatedAdjustment.typeValue);
    const reason = convertUndefinedToNull(validatedAdjustment.reason);
    const description = convertUndefinedToNull(validatedAdjustment.description);
    const retailerId = convertUndefinedToNull(validatedAdjustment.retailerId);
    const createdDate = convertUndefinedToNull(validatedAdjustment.createdDate);
    const modifiedDate = convertUndefinedToNull(
      validatedAdjustment.modifiedDate
    );

    const jsonData = JSON.stringify(adjustment);

    const query = `
      INSERT INTO inventory_adjustments 
        (id, code, adjustmentDate, branchId, branchName, createdById, 
         createdByName, type, typeValue, reason, description, retailerId, 
         createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        adjustmentDate = VALUES(adjustmentDate),
        branchName = VALUES(branchName),
        createdByName = VALUES(createdByName),
        type = VALUES(type),
        typeValue = VALUES(typeValue),
        reason = VALUES(reason),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      adjustmentDate,
      branchId,
      branchName,
      createdById,
      createdByName,
      type,
      typeValue,
      reason,
      description,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle adjustment details if present
    if (
      adjustment.adjustmentDetails &&
      Array.isArray(adjustment.adjustmentDetails)
    ) {
      await connection.execute(
        "DELETE FROM inventory_adjustment_details WHERE adjustmentId = ?",
        [id]
      );

      for (const detail of adjustment.adjustmentDetails) {
        const detailQuery = `
          INSERT INTO inventory_adjustment_details 
            (adjustmentId, productId, productCode, productName, oldQuantity, 
             newQuantity, adjustmentQuantity, cost, reason, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          convertUndefinedToNull(detail.productId),
          convertUndefinedToNull(detail.productCode),
          convertUndefinedToNull(detail.productName),
          convertUndefinedToNull(detail.oldQuantity) || 0,
          convertUndefinedToNull(detail.newQuantity) || 0,
          convertUndefinedToNull(detail.adjustmentQuantity) || 0,
          convertUndefinedToNull(detail.cost) || 0,
          convertUndefinedToNull(detail.reason),
          convertUndefinedToNull(detail.note),
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(
      `Error saving inventory adjustment ${adjustment.code}:`,
      error
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// updateSyncStatus and getSyncStatus functions
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'inventory_adjustments'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('inventory_adjustments', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating inventory adjustment sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["inventory_adjustments"]
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
    console.error("Error getting inventory adjustment sync status:", error);
    throw error;
  }
}

module.exports = {
  saveInventoryAdjustment,
  saveInventoryAdjustments,
  updateSyncStatus,
  getSyncStatus,
};
