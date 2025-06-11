const { getPool } = require("../db");

/**
 * Save individual location to database
 * Follows the same pattern as other services
 */
async function saveLocation(locationData, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract location fields following KiotViet API structure
    const { id, name, normalName = null } = locationData;

    // Helper function for safe values
    const safeValue = (value) =>
      value === undefined || value === null ? null : value;

    // Store complete JSON data
    const jsonData = JSON.stringify(locationData);

    // Insert location record
    const query = `
      INSERT INTO locations 
        (id, name, normalName, jsonData, lastSyncDate)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        normalName = VALUES(normalName),
        jsonData = VALUES(jsonData),
        lastSyncDate = NOW()
    `;

    await connection.execute(query, [
      id,
      name,
      safeValue(normalName),
      jsonData,
    ]);

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(`Error saving location ${locationData.name}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple locations with batch processing
 * Follows the same pattern as other services
 */
async function saveLocations(locations) {
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
      `Processing ${locations.length} locations in batches of ${BATCH_SIZE}...`
    );

    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
      const batch = locations.slice(i, i + BATCH_SIZE);

      for (const location of batch) {
        try {
          // Validate required fields
          if (!location.id || !location.name) {
            console.warn(
              `Skipping location with missing required fields: ${JSON.stringify(
                {
                  id: location.id,
                  name: location.name,
                }
              )}`
            );
            failCount++;
            continue;
          }

          const validatedLocation = {
            id: location.id,
            name: location.name,
            ...location,
          };

          // Check if record exists
          const [existing] = await connection.execute(
            "SELECT id FROM locations WHERE id = ?",
            [validatedLocation.id]
          );

          const isNew = existing.length === 0;

          // Save location (will insert new or update existing)
          const result = await saveLocation(validatedLocation, connection);
          if (result.success) {
            successCount++;
            if (isNew) newCount++;
            else updatedCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(
            `Error processing location ${location.name}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed location batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          locations.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Location sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Location transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: locations.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'locations'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('locations', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating location sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["locations"]
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
    console.error("Error getting location sync status:", error);
    throw error;
  }
}

module.exports = {
  saveLocation,
  saveLocations,
  updateSyncStatus,
  getSyncStatus,
};
