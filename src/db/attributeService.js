// src/db/attributeService.js
const { getPool } = require("../db");

/**
 * Save individual attribute to database
 * Follows the same pattern as other entity services
 */
async function saveAttribute(attributeData, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract main attribute fields following KiotViet API structure
    const { id, name, attributeValues = [] } = attributeData;

    // Helper function for safe values (same as your other services)
    const safeValue = (value) =>
      value === undefined || value === null ? null : value;

    // Validate required fields
    if (!id || !name) {
      throw new Error("Attribute ID and name are required");
    }

    // Store complete JSON data
    const jsonData = JSON.stringify(attributeData);

    // Insert/Update main attribute record - matches corrected schema
    const attributeQuery = `
      INSERT INTO attributes 
        (id, name, jsonData)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        jsonData = VALUES(jsonData),
        modifiedDate = CURRENT_TIMESTAMP
    `;

    await connection.execute(attributeQuery, [
      safeValue(id),
      safeValue(name),
      jsonData,
    ]);

    // Process attribute values - matches corrected schema
    let valuesSaved = 0;
    if (attributeValues && Array.isArray(attributeValues)) {
      for (const attributeValue of attributeValues) {
        try {
          // Validate required fields for attribute values
          if (!attributeValue.value || !attributeValue.attributeId) {
            console.warn(
              `Skipping attribute value with missing fields: ${JSON.stringify(
                attributeValue
              )}`
            );
            continue;
          }

          const valueQuery = `
            INSERT INTO attribute_values 
              (attributeId, value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
              modifiedDate = CURRENT_TIMESTAMP
          `;

          await connection.execute(valueQuery, [
            safeValue(attributeValue.attributeId),
            safeValue(attributeValue.value),
          ]);

          valuesSaved++;
        } catch (valueError) {
          console.error(
            `Error saving attribute value for attribute ${id}:`,
            valueError.message
          );
        }
      }
    }

    await connection.commit();

    return {
      success: true,
      attributeId: id,
      valuesSaved: valuesSaved,
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error saving attribute:", error.message);
    return {
      success: false,
      error: error.message,
      attributeId: attributeData.id,
    };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple attributes to database
 */
async function saveAttributes(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) {
    return {
      success: true,
      stats: { total: 0, success: 0, failed: 0 },
    };
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let failCount = 0;
  let totalValuesSaved = 0;
  const BATCH_SIZE = 50;

  try {
    await connection.beginTransaction();

    console.log(
      `Processing ${attributes.length} attributes in batches of ${BATCH_SIZE}...`
    );

    for (let i = 0; i < attributes.length; i += BATCH_SIZE) {
      const batch = attributes.slice(i, i + BATCH_SIZE);

      for (const attribute of batch) {
        try {
          // Validate required fields
          if (!attribute.id || !attribute.name) {
            console.warn(
              `Skipping attribute with missing required fields: ${JSON.stringify(
                {
                  id: attribute.id,
                  name: attribute.name,
                }
              )}`
            );
            failCount++;
            continue;
          }

          const validatedAttribute = {
            id: attribute.id,
            name: attribute.name,
            ...attribute,
          };

          // Check if record exists
          const [existing] = await connection.execute(
            "SELECT id FROM attributes WHERE id = ?",
            [validatedAttribute.id]
          );

          const isNew = existing.length === 0;

          const result = await saveAttribute(validatedAttribute, connection);
          if (result.success) {
            successCount++;
            totalValuesSaved += result.valuesSaved;
            if (isNew) newCount++;
            else updatedCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(
            `Error processing attribute ${attribute.name}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed attribute batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(attributes.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Attribute sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Attribute transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: attributes.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
      totalValuesSaved: totalValuesSaved,
    },
  };
}

/**
 * Update sync status for attributes
 */
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'attributes'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('attributes', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating attribute sync status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sync status for attributes
 */
async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["attributes"]
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: rows[0].historical_completed,
      };
    } else {
      return {
        lastSync: null,
        historicalCompleted: false,
      };
    }
  } catch (error) {
    console.error("Error getting attribute sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
    };
  }
}

/**
 * Get attribute statistics
 */
async function getAttributeStats() {
  const pool = getPool();

  try {
    const [attributeCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM attributes"
    );

    const [valueCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM attribute_values"
    );

    const [lastSync] = await pool.execute(`
      SELECT last_sync, historical_completed 
      FROM sync_status 
      WHERE entity_type = 'attributes'
    `);

    return {
      totalAttributes: attributeCount[0].count,
      totalValues: valueCount[0].count,
      lastSync: lastSync[0]?.last_sync || null,
      historicalCompleted: lastSync[0]?.historical_completed || false,
    };
  } catch (error) {
    console.error("Error getting attribute statistics:", error);
    return {
      totalAttributes: 0,
      totalValues: 0,
      lastSync: null,
      historicalCompleted: false,
    };
  }
}

/**
 * Get attributes with their values
 */
async function getAttributesWithValues(limit = 100, offset = 0) {
  const pool = getPool();

  try {
    const query = `
      SELECT 
        a.id,
        a.name,
        a.createdDate,
        a.modifiedDate,
        GROUP_CONCAT(av.value SEPARATOR ', ') as attributeValues,
        COUNT(av.id) as valueCount
      FROM attributes a
      LEFT JOIN attribute_values av ON a.id = av.attributeId
      GROUP BY a.id, a.name, a.createdDate, a.modifiedDate
      ORDER BY a.modifiedDate DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.execute(query, [limit, offset]);
    return rows;
  } catch (error) {
    console.error("Error getting attributes with values:", error);
    return [];
  }
}

module.exports = {
  saveAttribute,
  saveAttributes,
  updateSyncStatus,
  getSyncStatus,
  getAttributeStats,
  getAttributesWithValues,
};
