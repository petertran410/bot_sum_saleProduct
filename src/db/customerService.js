const { getPool } = require("../db");

function validateAndSanitizeCustomer(customer) {
  return {
    ...customer,
    code: customer.code ? String(customer.code).substring(0, 50) : "",
    name: customer.name ? String(customer.name).substring(0, 255) : "",
    contactNumber: customer.contactNumber
      ? String(customer.contactNumber).substring(0, 50)
      : null,
    email: customer.email ? String(customer.email).substring(0, 100) : null,
    address: customer.address
      ? String(customer.address).substring(0, 500)
      : null,
    locationName: customer.locationName
      ? String(customer.locationName).substring(0, 100)
      : null,
    comments: customer.comments
      ? String(customer.comments).substring(0, 1000)
      : null,
    debt: isNaN(Number(customer.debt)) ? 0 : Number(customer.debt),
    rewardPoint: isNaN(Number(customer.rewardPoint))
      ? 0
      : Number(customer.rewardPoint),
  };
}

async function saveCustomers(customers) {
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
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);

      for (const customer of batch) {
        try {
          // Validate and sanitize
          const validatedCustomer = validateAndSanitizeCustomer(customer);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM customers WHERE id = ?",
            [validatedCustomer.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedCustomer.modifiedDate &&
            new Date(validatedCustomer.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveCustomer(validatedCustomer, connection);
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
            `Error processing customer ${customer.code || customer.id}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed customer batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          customers.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Customer sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Customer transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: customers.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

async function saveCustomer(customer, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      code,
      name,
      contactNumber = null,
      email = null,
      address = null,
      gender = null,
      birthDate = null,
      locationName = null,
      wardName = null,
      organization = null,
      taxCode = null,
      comments = null,
      debt = 0,
      rewardPoint = 0,
      retailerId,
      createdDate = null,
      modifiedDate = null,
    } = customer;

    // Determine the primary group ID from API data
    let primaryGroupId = null;

    // From API: customer might have groupIds array or groups string
    if (
      customer.groupIds &&
      Array.isArray(customer.groupIds) &&
      customer.groupIds.length > 0
    ) {
      primaryGroupId = customer.groupIds[0]; // Take first group as primary
    }

    const jsonData = JSON.stringify(customer);

    const query = `
      INSERT INTO customers 
        (id, code, name, contactNumber, email, address, gender, birthDate, 
         locationName, wardName, organizationName, taxCode, comments, debt, 
         rewardPoint, retailerId, groupId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        contactNumber = VALUES(contactNumber),
        email = VALUES(email),
        address = VALUES(address),
        gender = VALUES(gender),
        birthDate = VALUES(birthDate),
        locationName = VALUES(locationName),
        wardName = VALUES(wardName),
        organizationName = VALUES(organizationName),
        taxCode = VALUES(taxCode),
        comments = VALUES(comments),
        debt = VALUES(debt),
        rewardPoint = VALUES(rewardPoint),
        groupId = VALUES(groupId),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      name,
      contactNumber,
      email,
      address,
      gender,
      birthDate,
      locationName,
      wardName,
      organization,
      taxCode,
      comments,
      debt,
      rewardPoint,
      retailerId,
      primaryGroupId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle customer group details if present (many-to-many relationship)
    if (customer.groupIds && Array.isArray(customer.groupIds)) {
      // Delete existing group relationships
      await connection.execute(
        "DELETE FROM customer_group_details WHERE customerId = ?",
        [id]
      );

      // Insert new group relationships
      for (const groupId of customer.groupIds) {
        try {
          await connection.execute(
            `INSERT INTO customer_group_details (customerId, groupId, createdDate) 
             VALUES (?, ?, NOW())`,
            [id, groupId]
          );
        } catch (groupError) {
          console.warn(
            `Warning: Could not save customer group relationship for customer ${id}, group ${groupId}: ${groupError.message}`
          );
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving customer ${customer.code}:`, error);
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
      WHERE entity_type = 'customers'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('customers', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating customer sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["customers"]
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
    console.error("Error getting customer sync status:", error);
    throw error;
  }
}

module.exports = {
  saveCustomer,
  saveCustomers,
  updateSyncStatus,
  getSyncStatus,
};
