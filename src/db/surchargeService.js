// src/db/surchargeService.js - FIXED VERSION with foreign key validation
const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizeSurcharge(surcharge) {
  return {
    ...surcharge,
    code: surcharge.code ? String(surcharge.code).substring(0, 50) : "",
    description: surcharge.description
      ? String(surcharge.description).substring(0, 1000)
      : null,
    branchName: surcharge.branchName
      ? String(surcharge.branchName).substring(0, 255)
      : null,
    createdByName: surcharge.createdByName
      ? String(surcharge.createdByName).substring(0, 255)
      : null,
    amount: isNaN(Number(surcharge.amount)) ? 0 : Number(surcharge.amount),
  };
}

// FIXED: Function to check if foreign key references exist
async function validateForeignKeys(surcharge, connection) {
  const validatedData = { ...surcharge };

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

async function saveSurcharges(surcharges) {
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
    for (let i = 0; i < surcharges.length; i += BATCH_SIZE) {
      const batch = surcharges.slice(i, i + BATCH_SIZE);

      for (const surcharge of batch) {
        try {
          // Validate and sanitize
          const validatedSurcharge = validateAndSanitizeSurcharge(surcharge);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM surcharges WHERE id = ?",
            [validatedSurcharge.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedSurcharge.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedSurcharge.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveSurcharge(validatedSurcharge, connection);
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
            `Error processing surcharge ${surcharge.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed surcharge batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(surcharges.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Surcharge sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Surcharge transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: surcharges.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// FIXED: Update saveSurcharge to accept connection parameter and validate foreign keys
async function saveSurcharge(surcharge, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Validate foreign keys before insertion
    const validatedSurcharge = await validateForeignKeys(surcharge, connection);

    // FIXED: Extract and convert undefined to null
    const id = convertUndefinedToNull(validatedSurcharge.id);
    const code = convertUndefinedToNull(validatedSurcharge.code) || "";
    const surchargeDate = convertUndefinedToNull(
      validatedSurcharge.surchargeDate
    );
    const branchId = convertUndefinedToNull(validatedSurcharge.branchId);
    const branchName = convertUndefinedToNull(validatedSurcharge.branchName);
    const createdById = convertUndefinedToNull(validatedSurcharge.createdById);
    const createdByName = convertUndefinedToNull(
      validatedSurcharge.createdByName
    );
    const type = convertUndefinedToNull(validatedSurcharge.type);
    const typeValue = convertUndefinedToNull(validatedSurcharge.typeValue);
    const amount = convertUndefinedToNull(validatedSurcharge.amount);
    const description = convertUndefinedToNull(validatedSurcharge.description);
    const retailerId = convertUndefinedToNull(validatedSurcharge.retailerId);
    const createdDate = convertUndefinedToNull(validatedSurcharge.createdDate);
    const modifiedDate = convertUndefinedToNull(
      validatedSurcharge.modifiedDate
    );

    const jsonData = JSON.stringify(surcharge);

    const query = `
      INSERT INTO surcharges 
        (id, code, surchargeDate, branchId, branchName, createdById, 
         createdByName, type, typeValue, amount, description, retailerId, 
         createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        surchargeDate = VALUES(surchargeDate),
        branchName = VALUES(branchName),
        createdByName = VALUES(createdByName),
        type = VALUES(type),
        typeValue = VALUES(typeValue),
        amount = VALUES(amount),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      surchargeDate,
      branchId,
      branchName,
      createdById,
      createdByName,
      type,
      typeValue,
      amount,
      description,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving surcharge ${surcharge.code}:`, error);
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
      WHERE entity_type = 'surcharges'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('surcharges', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating surcharge sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["surcharges"]
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
    console.error("Error getting surcharge sync status:", error);
    throw error;
  }
}

module.exports = {
  saveSurcharge,
  saveSurcharges,
  updateSyncStatus,
  getSyncStatus,
};
