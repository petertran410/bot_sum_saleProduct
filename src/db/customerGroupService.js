const { getPool } = require("../db.js");

// Add data validation and sanitization - following API documentation exactly
function validateAndSanitizeCustomerGroup(customerGroup) {
  return {
    ...customerGroup,
    id: customerGroup.id ? Number(customerGroup.id) : null,
    name: customerGroup.name
      ? String(customerGroup.name).substring(0, 100)
      : "",
    description: customerGroup.description
      ? String(customerGroup.description).substring(0, 1000)
      : null,
    discount: isNaN(Number(customerGroup.discount))
      ? null
      : Number(customerGroup.discount),
    retailerId: customerGroup.retailerId
      ? Number(customerGroup.retailerId)
      : null,
    createdBy: customerGroup.createdBy ? Number(customerGroup.createdBy) : null,
    createdDate: customerGroup.createdDate || null,
  };
}

async function saveCustomerGroups(customerGroups) {
  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  const BATCH_SIZE = 50;

  try {
    await connection.beginTransaction();

    // Get existing customer groups to avoid checking each one individually
    const [existingGroups] = await connection.execute(
      "SELECT id FROM customer_groups"
    );
    const existingGroupIds = new Set(existingGroups.map((row) => row.id));

    // Process in batches - exactly like products
    for (let i = 0; i < customerGroups.length; i += BATCH_SIZE) {
      const batch = customerGroups.slice(i, i + BATCH_SIZE);

      for (const customerGroup of batch) {
        try {
          // Validate and sanitize
          const validatedCustomerGroup =
            validateAndSanitizeCustomerGroup(customerGroup);

          const isNew = !existingGroupIds.has(validatedCustomerGroup.id);

          const result = await saveCustomerGroup(
            validatedCustomerGroup,
            connection
          );

          if (result.success) {
            successCount++;
            if (isNew) {
              newCount++;
              existingGroupIds.add(validatedCustomerGroup.id);
            } else {
              updatedCount++;
            }
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(
            `Error processing customer group ${
              customerGroup.name || customerGroup.id
            }:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed customer group batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(customerGroups.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Customer group sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Customer group transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: customerGroups.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveCustomerGroup to accept connection parameter - matching product pattern
async function saveCustomerGroup(customerGroup, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      name,
      description = null,
      discount = null,
      retailerId,
      createdBy = null,
      createdDate = null,
    } = customerGroup;

    const jsonData = JSON.stringify(customerGroup);

    const query = `
      INSERT INTO customer_groups 
        (id, name, description, discount, retailerId, createdBy, 
         createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        discount = VALUES(discount),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      name,
      description,
      discount,
      retailerId,
      createdBy,
      createdDate,
      jsonData,
    ]);

    // No need to handle customerGroupDetails - direct relationship through customers.groupId

    return { success: true };
  } catch (error) {
    console.error(`Error saving customer group ${customerGroup.name}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// Keep existing updateSyncStatus and getSyncStatus functions - matching product pattern
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'customer_groups'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('customer_groups', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating customer group sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["customer_groups"]
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
    console.error("Error getting customer group sync status:", error);
    throw error;
  }
}

module.exports = {
  saveCustomerGroup,
  saveCustomerGroups,
  updateSyncStatus,
  getSyncStatus,
};
