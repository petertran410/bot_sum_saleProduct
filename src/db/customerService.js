const { getPool } = require("../db");

// Modify the saveCustomer function to handle locks better
async function saveCustomer(customer) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // Use a shorter transaction with more targeted operations
    await connection.beginTransaction();

    // Extract customer data and perform insert with shorter transaction time
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

    // Use a transaction with retry logic
    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        // Main insert operation
        const query = `
          INSERT INTO customers 
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

        // Commit after the main insertion
        await connection.commit();
        success = true;

        // Handle customer groups in a separate transaction
        if (customer.groups) {
          await handleCustomerGroups(connection, customer, id, retailerId);
        }

        return { success: true };
      } catch (error) {
        if (error.code === "ER_LOCK_WAIT_TIMEOUT" && retries > 1) {
          // If lock timeout, rollback and retry
          await connection.rollback();
          retries--;
          console.log(
            `Lock timeout for customer ${customer.code}, retrying (${retries} attempts left)`
          );
          // Add a small random delay before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, 500 + Math.random() * 1000)
          );
        } else {
          // For other errors or if out of retries, propagate the error
          await connection.rollback();
          throw error;
        }
      }
    }
  } catch (error) {
    await connection.rollback();
    console.error(`Error saving customer ${customer.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

// Helper function to handle customer groups separately
async function handleCustomerGroups(
  connection,
  customer,
  customerId,
  retailerId
) {
  try {
    // Clear existing associations
    await connection.execute(
      "DELETE FROM customer_group_details WHERE customerId = ?",
      [customerId]
    );

    // Get customer groups
    const [existingGroups] = await connection.execute(
      "SELECT id, name FROM customer_groups WHERE retailerId = ?",
      [retailerId]
    );

    // Create a map for fast lookups
    const groupMap = new Map();
    for (const group of existingGroups) {
      groupMap.set(group.name.toLowerCase(), group.id);
    }

    // Parse group names
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

    // Process each group and link to customer
    for (const groupName of groupNames) {
      if (!groupName) continue;

      let groupId = groupMap.get(groupName.toLowerCase());

      if (!groupId) {
        // Group doesn't exist, create it
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

      // Link customer to group
      try {
        const detailQuery = `
          INSERT INTO customer_group_details 
            (customerId, groupId)
          VALUES (?, ?)
        `;

        await connection.execute(detailQuery, [customerId, groupId]);
      } catch (detailError) {
        console.warn(
          `Warning: Could not link customer ${customerId} to group ${groupId}: ${detailError.message}`
        );
        // Continue with other groups
      }
    }

    return true;
  } catch (error) {
    console.error(`Error handling customer groups for ${customerId}:`, error);
    return false;
  }
}

// Updated saveCustomers function
async function saveCustomers(customers) {
  const pool = getPool();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let existingCount = 0;

  // First, get all existing customer IDs in one query for better performance
  const [existingCustomers] = await pool.execute("SELECT id FROM customers");

  // Create a Set for fast lookups
  const existingIds = new Set();
  existingCustomers.forEach((row) => existingIds.add(row.id));

  console.log(`Found ${existingIds.size} existing customers in database`);

  // Process in smaller batches to avoid lock contention
  const batchSize = 10; // Reduce from the original batch size

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, Math.min(i + batchSize, customers.length));
    console.log(
      `Processing customer batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        customers.length / batchSize
      )}, size: ${batch.length}`
    );

    // Process each customer in the batch sequentially
    for (const customer of batch) {
      try {
        // Check if customer already exists using our pre-populated Set
        const isNew = !existingIds.has(customer.id);

        const result = await saveCustomer(customer);
        if (result.success) {
          successCount++;
          if (isNew) {
            newCount++;
            // Add to our Set so we don't count it as new again
            existingIds.add(customer.id);
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

    // Add a small delay between batches to reduce database contention
    if (i + batchSize < customers.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `Processed ${customers.length} customers: ${newCount} new, ${existingCount} existing, ${failCount} failed`
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
