const { getPool } = require("../db");

// Add data validation and sanitization
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
  let existingCount = 0;

  const BATCH_SIZE = 50;
  console.log(
    `Processing ${customers.length} customers in batches of ${BATCH_SIZE}`
  );

  try {
    await connection.beginTransaction();

    // Get existing IDs for faster lookup
    const [existingCustomers] = await connection.execute(
      "SELECT id FROM customers"
    );
    const existingIds = new Set(existingCustomers.map((row) => row.id));

    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          customers.length / BATCH_SIZE
        )}`
      );

      for (const customer of batch) {
        try {
          // Validate and sanitize
          const validatedCustomer = validateAndSanitizeCustomer(customer);
          const isNew = !existingIds.has(validatedCustomer.id);

          const result = await saveCustomer(validatedCustomer, connection);
          if (result.success) {
            successCount++;
            if (isNew) {
              newCount++;
              existingIds.add(validatedCustomer.id);
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

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Customer sync completed: ${newCount} new, ${existingCount} updated, ${failCount} failed`
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
      existing: existingCount,
      failed: failCount,
    },
  };
}

// Update saveCustomer to accept connection parameter
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

    const jsonData = JSON.stringify(customer);

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

    // Handle customer groups with proper duplicate prevention
    if (customer.groups) {
      // Instead of deleting all and re-inserting, we'll use a more robust approach

      // Get existing groups for this customer
      const [existingGroupLinks] = await connection.execute(
        "SELECT groupId FROM customer_group_details WHERE customerId = ?",
        [id]
      );
      const existingGroupIds = new Set(
        existingGroupLinks.map((row) => row.groupId)
      );

      // Get all available groups
      const [existingGroups] = await connection.execute(
        "SELECT id, name FROM customer_groups WHERE retailerId = ?",
        [retailerId]
      );

      const groupMap = new Map();
      for (const group of existingGroups) {
        groupMap.set(group.name.toLowerCase(), group.id);
      }

      // Process group names
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

      // Process each group
      for (const groupName of groupNames) {
        if (!groupName) continue;

        let groupId = groupMap.get(groupName.toLowerCase());

        // Create group if it doesn't exist
        if (!groupId) {
          try {
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
          } catch (groupError) {
            console.warn(
              `Warning: Could not create group ${groupName}: ${groupError.message}`
            );
            continue;
          }
        }

        // Link customer to group only if not already linked
        if (!existingGroupIds.has(groupId)) {
          try {
            await connection.execute(
              "INSERT INTO customer_group_details (customerId, groupId) VALUES (?, ?) ON DUPLICATE KEY UPDATE customerId = customerId",
              [id, groupId]
            );
          } catch (linkError) {
            // This should now be rare, but we'll handle it gracefully
            if (linkError.code === "ER_DUP_ENTRY") {
              console.log(
                `Customer ${id} already linked to group ${groupId}, skipping...`
              );
            } else {
              console.warn(
                `Warning: Could not link customer ${id} to group ${groupId}: ${linkError.message}`
              );
            }
          }
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

// Keep existing updateSyncStatus and getSyncStatus functions
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
