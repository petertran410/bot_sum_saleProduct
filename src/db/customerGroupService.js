const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeCustomerGroup(customerGroup) {
  return {
    ...customerGroup,
    name: customerGroup.name
      ? String(customerGroup.name).substring(0, 100)
      : "",
    description: customerGroup.description
      ? String(customerGroup.description).substring(0, 1000)
      : null,
    discount: isNaN(Number(customerGroup.discount))
      ? 0
      : Number(customerGroup.discount),
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

    for (let i = 0; i < customerGroups.length; i += BATCH_SIZE) {
      const batch = customerGroups.slice(i, i + BATCH_SIZE);

      for (const customerGroup of batch) {
        try {
          const validatedCustomerGroup =
            validateAndSanitizeCustomerGroup(customerGroup);

          const [existing] = await connection.execute(
            "SELECT id, source FROM customer_groups WHERE name = ? AND retailerId = ?",
            [validatedCustomerGroup.name, validatedCustomerGroup.retailerId]
          );

          const isNew = existing.length === 0;
          const isKiotVietGroup =
            existing.length > 0 && existing[0].source === "kiotviet";

          if (isNew || isKiotVietGroup) {
            const result = await saveCustomerGroup(
              validatedCustomerGroup,
              connection,
              existing[0]?.id
            );
            if (result.success) {
              successCount++;
              if (isNew) newCount++;
              else updatedCount++;
            } else {
              failCount++;
            }
          } else {
            console.log(
              `Skipping local group with same name: ${validatedCustomerGroup.name}`
            );
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

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
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

// Fixed saveCustomerGroup for your exact table structure
async function saveCustomerGroup(
  customerGroup,
  connection = null,
  existingId = null
) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      name,
      description = null,
      discount = null,
      retailerId,
    } = customerGroup;

    const modifiedDate = new Date();
    const createdDate = new Date();
    const jsonData = JSON.stringify(customerGroup);

    if (existingId) {
      // Update existing KiotViet group
      const updateQuery = `
        UPDATE customer_groups 
        SET 
          name = ?,
          description = ?,
          discount = ?,
          modifiedDate = ?,
          jsonData = ?,
          source = 'kiotviet'
        WHERE id = ?
      `;

      await connection.execute(updateQuery, [
        name,
        description,
        discount,
        modifiedDate,
        jsonData,
        existingId,
      ]);

      console.log(
        `Updated existing customer group: ${name} (ID: ${existingId})`
      );
    } else {
      // Insert new KiotViet group (let auto_increment handle the ID)
      const insertQuery = `
        INSERT INTO customer_groups 
          (name, description, discount, retailerId, createdDate, modifiedDate, jsonData, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'kiotviet')
      `;

      const [result] = await connection.execute(insertQuery, [
        name,
        description,
        discount,
        retailerId,
        createdDate,
        modifiedDate,
        jsonData,
      ]);

      const newId = result.insertId;
      console.log(`Created new customer group: ${name} (ID: ${newId})`);
      existingId = newId;
    }

    // Handle customer group details if present
    if (
      customerGroup.customerGroupDetails &&
      Array.isArray(customerGroup.customerGroupDetails)
    ) {
      // Delete existing group details for this group
      await connection.execute(
        "DELETE FROM customer_group_details WHERE groupId = ?",
        [existingId]
      );

      // Insert new group details
      for (const detail of customerGroup.customerGroupDetails) {
        try {
          // Check if the customer exists before linking
          const [customerExists] = await connection.execute(
            "SELECT id FROM customers WHERE id = ?",
            [detail.customerId]
          );

          if (customerExists.length > 0) {
            const detailQuery = `
              INSERT INTO customer_group_details (customerId, groupId)
              VALUES (?, ?)
              ON DUPLICATE KEY UPDATE groupId = VALUES(groupId)
            `;

            await connection.execute(detailQuery, [
              detail.customerId,
              existingId,
            ]);
          } else {
            console.warn(
              `Customer ${detail.customerId} not found, skipping group detail`
            );
          }
        } catch (detailError) {
          console.warn(
            `Warning: Could not save customer group detail for group ${existingId}, customer ${detail.customerId}: ${detailError.message}`
          );
        }
      }
    }

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
