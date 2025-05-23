const { getPool } = require("../db");

async function saveCustomer(customer) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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

    const jsonData = JSON.stringify(customer);

    const query = `
      INSERT IGNORE INTO customers 
        (id, code, name, contactNumber, email, address, gender, birthDate, 
         locationName, wardName, organizationName, taxCode, comments, debt, 
         rewardPoint, retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    await connection.execute(
      "DELETE FROM customer_group_details WHERE customerId = ?",
      [id]
    );

    if (customer.groups) {
      const [existingGroups] = await connection.execute(
        "SELECT id, name FROM customer_groups WHERE retailerId = ?",
        [retailerId]
      );

      const groupMap = new Map();
      for (const group of existingGroups) {
        groupMap.set(group.name.toLowerCase(), group.id);
      }

      let groupNames = [];
      if (typeof customer.groups === "string") {
        groupNames = customer.groups
          .split("|")
          .map((g) => g.trim())
          .filter((g) => g.length > 0);
      } else if (Array.isArray(customer.groups)) {
        for (const group of customer.groups) {
          if (typeof group === "string") {
            groupNames.push(group.trim());
          } else if (group && typeof group === "object" && group.name) {
            groupNames.push(group.name.trim());
          }
        }
      }

      for (const groupName of groupNames) {
        if (!groupName) continue;

        let groupId = groupMap.get(groupName.toLowerCase());

        if (!groupId) {
          const [maxIdResult] = await connection.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM customer_groups"
          );

          const nextId = Math.max(maxIdResult[0].nextId, 1000);

          await connection.execute(
            "INSERT INTO customer_groups (id, name, retailerId, createdDate) VALUES (?, ?, ?, NOW())",
            [nextId, groupName, retailerId]
          );

          groupId = nextId;
          groupMap.set(groupName.toLowerCase(), groupId);
        }

        try {
          const detailQuery = `
            INSERT INTO customer_group_details 
              (customerId, groupId)
            VALUES (?, ?)
          `;

          await connection.execute(detailQuery, [id, groupId]);
        } catch (detailError) {
          console.warn(
            `Warning: Could not link customer ${id} to group ${groupId}: ${detailError.message}`
          );
        }
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(`Error saving customer ${customer.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

// Updated saveCustomers function
async function saveCustomers(customers) {
  const pool = getPool();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let existingCount = 0;

  // Get existing IDs all at once for faster lookup
  const [existingCustomers] = await pool.execute("SELECT id FROM customers");
  const existingIds = new Set();
  existingCustomers.forEach((row) => existingIds.add(row.id));

  // Process in batches to prevent memory issues
  const BATCH_SIZE = 50; // Smaller batch size for more reliable processing
  console.log(
    `Processing ${customers.length} customers in batches of ${BATCH_SIZE}`
  );

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        customers.length / BATCH_SIZE
      )}`
    );

    // Process each customer in the batch
    for (const customer of batch) {
      try {
        const isNew = !existingIds.has(customer.id);

        const result = await saveCustomer(customer);
        if (result.success) {
          successCount++;
          if (isNew) {
            newCount++;
            existingIds.add(customer.id); // Update our tracking set
          } else {
            existingCount++;
          }
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(
          `Error processing customer ${customer.code || customer.id}:`,
          error
        );
        failCount++;
      }
    }

    // Give the database a moment to breathe
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `Batch processing complete: ${successCount} successful, ${newCount} new, ${failCount} failed`
  );

  return {
    success: failCount === 0,
    stats: {
      total: customers.length,
      success: successCount,
      newRecords: newCount,
      existing: existingCount,
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
      WHERE entity_type = 'customers'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      console.warn(
        "No sync_status record was updated. Attempting to insert..."
      );

      const insertQuery = `INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES ('customers', ?, ?) ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)`;

      const [insertResult] = await pool.execute(insertQuery, [
        lastSync,
        completed,
      ]);
      console.log(`Sync status insert result: ${JSON.stringify(insertResult)}`);
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

async function resetCustomerData() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute("DELETE FROM customer_group_details");

    await connection.execute("DELETE FROM customer_groups");

    await connection.execute("DELETE FROM customers");

    await connection.execute(
      "UPDATE sync_status SET last_sync = NULL, historical_completed = 0 WHERE entity_type = 'customers'"
    );

    await connection.commit();
    console.log("Customer data reset complete");

    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error("Error resetting customer data:", error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

module.exports = {
  saveCustomer,
  saveCustomers,
  updateSyncStatus,
  getSyncStatus,
  resetCustomerData,
};
