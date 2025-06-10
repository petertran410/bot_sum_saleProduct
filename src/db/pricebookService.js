const { getPool } = require("../db.js");

// Add data validation and sanitization
function validateAndSanitizePricebook(pricebook) {
  return {
    ...pricebook,
    name: pricebook.name ? String(pricebook.name).substring(0, 255) : "",
    isActive: Boolean(pricebook.isActive),
    isGlobal: Boolean(pricebook.isGlobal),
    forAllCusGroup: Boolean(pricebook.forAllCusGroup),
    forAllUser: Boolean(pricebook.forAllUser),
    startDate: pricebook.startDate || null,
    endDate: pricebook.endDate || null,
  };
}

async function savePricebooks(pricebooks) {
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
    for (let i = 0; i < pricebooks.length; i += BATCH_SIZE) {
      const batch = pricebooks.slice(i, i + BATCH_SIZE);

      for (const pricebook of batch) {
        try {
          // Validate and sanitize
          const validatedPricebook = validateAndSanitizePricebook(pricebook);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM pricebooks WHERE id = ?",
            [validatedPricebook.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedPricebook.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedPricebook.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await savePricebook(validatedPricebook, connection);
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
            `Error processing pricebook ${pricebook.name}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed pricebook batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(pricebooks.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Pricebook sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Pricebook transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: pricebooks.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update savePricebook to accept connection parameter
async function savePricebook(pricebook, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      name,
      isActive = true,
      isGlobal = false,
      startDate = null,
      endDate = null,
      forAllCusGroup = false,
      forAllUser = false,
      retailerId = null,
      createdDate = null,
      modifiedDate = null,
    } = pricebook;

    const jsonData = JSON.stringify(pricebook);

    const query = `
      INSERT INTO pricebooks 
        (id, name, isActive, isGlobal, startDate, endDate, forAllCusGroup, 
         forAllUser, retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        isActive = VALUES(isActive),
        isGlobal = VALUES(isGlobal),
        startDate = VALUES(startDate),
        endDate = VALUES(endDate),
        forAllCusGroup = VALUES(forAllCusGroup),
        forAllUser = VALUES(forAllUser),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      name,
      isActive,
      isGlobal,
      startDate,
      endDate,
      forAllCusGroup,
      forAllUser,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle pricebook branches if present
    if (
      pricebook.priceBookBranches &&
      Array.isArray(pricebook.priceBookBranches)
    ) {
      await connection.execute(
        "DELETE FROM pricebook_branches WHERE priceBookId = ?",
        [id]
      );

      for (const branch of pricebook.priceBookBranches) {
        try {
          const branchQuery = `
            INSERT INTO pricebook_branches 
              (priceBookId, branchId, branchName)
            VALUES (?, ?, ?)
          `;

          await connection.execute(branchQuery, [
            id,
            branch.branchId,
            branch.branchName,
          ]);
        } catch (branchError) {
          console.warn(
            `Warning: Could not save branch for pricebook ${id}, branch ${branch.branchId}: ${branchError.message}`
          );
        }
      }
    }

    // Handle pricebook customer groups if present
    if (
      pricebook.priceBookCustomerGroups &&
      Array.isArray(pricebook.priceBookCustomerGroups)
    ) {
      await connection.execute(
        "DELETE FROM pricebook_customer_groups WHERE priceBookId = ?",
        [id]
      );

      for (const customerGroup of pricebook.priceBookCustomerGroups) {
        try {
          const customerGroupQuery = `
            INSERT INTO pricebook_customer_groups
              (priceBookId, customerGroupId, customerGroupName)
            VALUES (?, ?, ?)
          `;

          await connection.execute(customerGroupQuery, [
            id,
            customerGroup.customerGroupId,
            customerGroup.customerGroupName,
          ]);
        } catch (customerGroupError) {
          console.warn(
            `Warning: Could not save customer group for pricebook ${id}: ${customerGroupError.message}`
          );
        }
      }
    }

    // Handle pricebook users if present
    if (pricebook.priceBookUsers && Array.isArray(pricebook.priceBookUsers)) {
      await connection.execute(
        "DELETE FROM pricebook_users WHERE priceBookId = ?",
        [id]
      );

      for (const user of pricebook.priceBookUsers) {
        try {
          const userQuery = `
            INSERT INTO pricebook_users
              (priceBookId, userId, userName)
            VALUES (?, ?, ?)
          `;

          await connection.execute(userQuery, [id, user.userId, user.userName]);
        } catch (userError) {
          console.warn(
            `Warning: Could not save user for pricebook ${id}: ${userError.message}`
          );
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving pricebook ${pricebook.name}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// Get pricebook details with products
async function getPricebookDetails(pricebookId) {
  const pool = getPool();

  try {
    // Get pricebook details
    const [pricebooks] = await pool.execute(
      `SELECT * FROM pricebooks WHERE id = ?`,
      [pricebookId]
    );

    if (pricebooks.length === 0) {
      return null;
    }

    const pricebook = pricebooks[0];

    // Get product price details for this pricebook
    const [productPrices] = await pool.execute(
      `SELECT * FROM product_price_books WHERE priceBookId = ?`,
      [pricebookId]
    );

    return {
      ...pricebook,
      productPrices,
    };
  } catch (error) {
    console.error("Error getting pricebook details:", error);
    throw error;
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
      WHERE entity_type = 'pricebooks'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('pricebooks', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating pricebook sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["pricebooks"]
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
    console.error("Error getting pricebook sync status:", error);
    throw error;
  }
}

module.exports = {
  savePricebook,
  savePricebooks,
  getPricebookDetails,
  updateSyncStatus,
  getSyncStatus,
};
