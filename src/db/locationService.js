const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeLocation(location) {
  return {
    ...location,
    name: location.name ? String(location.name).substring(0, 255) : "",
    type: location.type ? String(location.type).substring(0, 50) : null,
    parentId: location.parentId || null,
  };
}

async function saveLocations(locations) {
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
    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
      const batch = locations.slice(i, i + BATCH_SIZE);

      for (const location of batch) {
        try {
          // Validate and sanitize
          const validatedLocation = validateAndSanitizeLocation(location);

          const [existing] = await connection.execute(
            "SELECT id FROM locations WHERE id = ?",
            [validatedLocation.id]
          );

          const isNew = existing.length === 0;

          if (isNew) {
            const result = await saveLocation(validatedLocation, connection);
            if (result.success) {
              successCount++;
              newCount++;
            } else {
              failCount++;
            }
          } else {
            // Update existing location
            const result = await saveLocation(validatedLocation, connection);
            if (result.success) {
              successCount++;
              updatedCount++;
            } else {
              failCount++;
            }
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

async function saveLocation(location, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      name,
      type = null,
      parentId = null,
      level = 1,
      code = null,
    } = location;

    const jsonData = JSON.stringify(location);

    const query = `
      INSERT INTO locations 
        (id, name, type, parentId, level, code, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        type = VALUES(type),
        parentId = VALUES(parentId),
        level = VALUES(level),
        code = VALUES(code),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      name,
      type,
      parentId,
      level,
      code,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving location ${location.name}:`, error);
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
