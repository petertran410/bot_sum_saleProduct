const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeSurcharge(surcharge) {
  return {
    ...surcharge,
    surchargeCode: surcharge.surchargeCode
      ? String(surcharge.surchargeCode).substring(0, 50)
      : "",
    surchargeName: surcharge.surchargeName
      ? String(surcharge.surchargeName).substring(0, 255)
      : "",
    valueRatio: isNaN(Number(surcharge.valueRatio))
      ? 0
      : Number(surcharge.valueRatio),
    value: isNaN(Number(surcharge.value)) ? 0 : Number(surcharge.value),
  };
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
            `Error processing surcharge ${surcharge.surchargeCode}:`,
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

// Update saveSurcharge to accept connection parameter
async function saveSurcharge(surcharge, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      surchargeCode,
      surchargeName,
      valueRatio = 0,
      value = null,
      retailerId,
      modifiedDate = null,
      createdDate = null,
    } = surcharge;

    const jsonData = JSON.stringify(surcharge);

    const query = `
      INSERT INTO surcharges 
        (id, surchargeCode, surchargeName, valueRatio, value, retailerId, modifiedDate, createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        surchargeCode = VALUES(surchargeCode),
        surchargeName = VALUES(surchargeName),
        valueRatio = VALUES(valueRatio),
        value = VALUES(value),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      surchargeCode,
      surchargeName,
      valueRatio,
      value,
      retailerId,
      modifiedDate,
      createdDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving surcharge ${surcharge.surchargeCode}:`, error);
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
