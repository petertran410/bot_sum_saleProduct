const { getPool } = require("../db");

/**
 * Validate and sanitize productOnHands data
 */
function validateAndSanitizeProductOnHands(item) {
  return {
    ...item,
    code: item.code ? String(item.code).substring(0, 50) : "",
    name: item.name ? String(item.name).substring(0, 255) : "",
    unit: item.unit ? String(item.unit).substring(0, 50) : null,
    basePrice: isNaN(Number(item.basePrice)) ? 0 : Number(item.basePrice),
    weight: isNaN(Number(item.weight)) ? 0 : Number(item.weight),
  };
}

/**
 * Save individual productOnHands to database
 * Follows the same pattern as other services
 */
async function saveProductOnHands(productOnHandsData, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract main productOnHands fields following KiotViet API structure
    const {
      id,
      code,
      createdDate,
      name,
      unit,
      basePrice,
      weight,
      modifiedDate,
      // Add other fields as they appear in the actual response
    } = productOnHandsData;

    // Helper function for safe values
    const safeValue = (value) =>
      value === undefined || value === null ? null : value;

    // Store complete JSON data
    const jsonData = JSON.stringify(productOnHandsData);

    // Insert productOnHands record
    const query = `
      INSERT INTO product_on_hands 
        (id, code, createdDate, name, unit, basePrice, weight, modifiedDate, jsonData, lastSyncDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        createdDate = VALUES(createdDate),
        name = VALUES(name),
        unit = VALUES(unit),
        basePrice = VALUES(basePrice),
        weight = VALUES(weight),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData),
        lastSyncDate = NOW()
    `;

    await connection.execute(query, [
      id,
      safeValue(code),
      safeValue(createdDate),
      safeValue(name),
      safeValue(unit),
      safeValue(basePrice) || 0,
      safeValue(weight) || 0,
      safeValue(modifiedDate),
      jsonData,
    ]);

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(
      `Error saving productOnHands ${productOnHandsData.code}:`,
      error
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple productOnHands with batch processing
 * Follows the same pattern as other services
 */
async function saveProductOnHandsArray(productOnHandsArray) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const BATCH_SIZE = 50;

  let successCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let failCount = 0;

  try {
    await connection.beginTransaction();

    console.log(
      `Processing ${productOnHandsArray.length} productOnHands in batches of ${BATCH_SIZE}...`
    );

    for (let i = 0; i < productOnHandsArray.length; i += BATCH_SIZE) {
      const batch = productOnHandsArray.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        try {
          // Validate required fields
          if (!item.id || !item.code) {
            console.warn(
              `Skipping productOnHands with missing required fields: ${JSON.stringify(
                {
                  id: item.id,
                  code: item.code,
                }
              )}`
            );
            failCount++;
            continue;
          }

          const validatedItem = validateAndSanitizeProductOnHands(item);

          // Check if record exists
          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM product_on_hands WHERE id = ?",
            [validatedItem.id]
          );

          const isNewRecord = existing.length === 0;
          let shouldUpdate = true;

          if (
            !isNewRecord &&
            existing[0].modifiedDate &&
            validatedItem.modifiedDate
          ) {
            const existingDate = new Date(existing[0].modifiedDate);
            const newDate = new Date(validatedItem.modifiedDate);
            shouldUpdate = newDate > existingDate;
          }

          if (isNewRecord || shouldUpdate) {
            const result = await saveProductOnHands(validatedItem, connection);
            if (result.success) {
              successCount++;
              if (isNewRecord) {
                newCount++;
              } else {
                updatedCount++;
              }
            } else {
              failCount++;
            }
          }
        } catch (error) {
          console.error(
            `Error processing productOnHands ${item.id}:`,
            error.message
          );
          failCount++;
        }
      }
    }

    await connection.commit();

    console.log(
      `✅ ProductOnHands batch completed: ${successCount} processed, ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );

    return {
      success: true,
      stats: {
        total: productOnHandsArray.length,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updatedRecords: updatedCount,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error in batch productOnHands processing:", error);
    return {
      success: false,
      error: error.message,
      stats: {
        total: productOnHandsArray.length,
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

const getSyncStatus = async () => {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["product_on_hands"]
    );

    if (rows.length === 0) {
      return {
        lastSync: null,
        historicalCompleted: false,
      };
    }

    return {
      lastSync: rows[0].last_sync,
      historicalCompleted: rows[0].historical_completed,
    };
  } catch (error) {
    console.error("Error getting productOnHands sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
    };
  }
};

const updateSyncStatus = async (historicalCompleted, lastSync) => {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'product_on_hands'
    `;

    const [result] = await pool.execute(query, [lastSync, historicalCompleted]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('product_on_hands', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, historicalCompleted]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating productOnHands sync status:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  saveProductOnHands,
  saveProductOnHandsArray,
  getSyncStatus,
  updateSyncStatus,
};
