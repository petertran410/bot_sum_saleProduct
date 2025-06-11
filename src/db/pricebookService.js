// src/db/pricebookService.js
const { getPool } = require("../db");

/**
 * Save a single pricebook to database
 * Based on actual data structure from KiotViet API
 */
async function savePricebook(pricebook, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    connection = await getPool().getConnection();
  }

  try {
    const {
      id,
      name,
      isActive,
      isGlobal,
      startDate,
      endDate,
      forAllCusGroup,
      forAllUser,
      priceBookBranches,
      priceBookCustomerGroups,
      priceBookUsers,
    } = pricebook;

    if (!id) {
      console.warn("Skipping pricebook without ID:", pricebook);
      return { success: false, error: "Missing pricebook ID" };
    }

    // Parse dates properly
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : null;

    // Insert or update main pricebook record
    const pricebookQuery = `
      INSERT INTO pricebooks (
        id, name, isActive, isGlobal, startDate, endDate, 
        forAllCusGroup, forAllUser, jsonData
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        isActive = VALUES(isActive),
        isGlobal = VALUES(isGlobal),
        startDate = VALUES(startDate),
        endDate = VALUES(endDate),
        forAllCusGroup = VALUES(forAllCusGroup),
        forAllUser = VALUES(forAllUser),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(pricebookQuery, [
      id,
      name || null,
      isActive !== undefined ? isActive : false,
      isGlobal !== undefined ? isGlobal : false,
      parsedStartDate,
      parsedEndDate,
      forAllCusGroup !== undefined ? forAllCusGroup : false,
      forAllUser !== undefined ? forAllUser : false,
      JSON.stringify(pricebook),
    ]);

    // Handle pricebook branches (if any)
    if (
      priceBookBranches &&
      Array.isArray(priceBookBranches) &&
      priceBookBranches.length > 0
    ) {
      // Delete existing branches for this pricebook
      await connection.execute(
        "DELETE FROM pricebook_branches WHERE priceBookId = ?",
        [id]
      );

      for (const branch of priceBookBranches) {
        try {
          const branchQuery = `
            INSERT INTO pricebook_branches
              (id, priceBookId, branchId, branchName)
            VALUES (?, ?, ?, ?)
          `;

          await connection.execute(branchQuery, [
            branch.id || null,
            branch.priceBookId || id,
            branch.branchId || null,
            branch.branchName || null,
          ]);
        } catch (branchError) {
          console.warn(
            `Warning: Could not save branch for pricebook ${id}: ${branchError.message}`
          );
        }
      }
    }

    // Handle pricebook customer groups (if any)
    if (
      priceBookCustomerGroups &&
      Array.isArray(priceBookCustomerGroups) &&
      priceBookCustomerGroups.length > 0
    ) {
      // Delete existing customer groups for this pricebook
      await connection.execute(
        "DELETE FROM pricebook_customer_groups WHERE priceBookId = ?",
        [id]
      );

      for (const customerGroup of priceBookCustomerGroups) {
        try {
          const customerGroupQuery = `
            INSERT INTO pricebook_customer_groups
              (id, priceBookId, customerGroupId, customerGroupName)
            VALUES (?, ?, ?, ?)
          `;

          await connection.execute(customerGroupQuery, [
            customerGroup.id || null,
            customerGroup.priceBookId || id,
            customerGroup.customerGroupId || null,
            customerGroup.customerGroupName || null,
          ]);
        } catch (cgError) {
          console.warn(
            `Warning: Could not save customer group for pricebook ${id}: ${cgError.message}`
          );
        }
      }
    }

    // Handle pricebook users (if any)
    if (
      priceBookUsers &&
      Array.isArray(priceBookUsers) &&
      priceBookUsers.length > 0
    ) {
      // Delete existing users for this pricebook
      await connection.execute(
        "DELETE FROM pricebook_users WHERE priceBookId = ?",
        [id]
      );

      for (const user of priceBookUsers) {
        try {
          const userQuery = `
            INSERT INTO pricebook_users
              (id, priceBookId, userId, userName)
            VALUES (?, ?, ?, ?)
          `;

          await connection.execute(userQuery, [
            user.id || null,
            user.priceBookId || id,
            user.userId || null,
            user.userName || null,
          ]);
        } catch (userError) {
          console.warn(
            `Warning: Could not save user for pricebook ${id}: ${userError.message}`
          );
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving pricebook ${pricebook.id}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Save multiple pricebooks in a transaction
 * Follows the same pattern as other services
 */
async function savePricebooks(pricebooks) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    let insertedCount = 0;
    let updatedCount = 0;
    let newRecords = 0;

    console.log(`Processing ${pricebooks.length} pricebooks...`);

    for (const pricebook of pricebooks) {
      const { id } = pricebook;

      if (!id) {
        console.warn("Skipping pricebook without ID:", pricebook);
        continue;
      }

      // Check if pricebook already exists
      const [existingRows] = await connection.execute(
        "SELECT id FROM pricebooks WHERE id = ?",
        [id]
      );

      const isNewRecord = existingRows.length === 0;

      const result = await savePricebook(pricebook, connection);

      if (result.success) {
        if (isNewRecord) {
          insertedCount++;
          newRecords++;
        } else {
          updatedCount++;
        }
      }
    }

    await connection.commit();

    console.log(
      `✅ Pricebook sync completed: ${insertedCount} inserted, ${updatedCount} updated`
    );

    return {
      success: true,
      stats: {
        total: pricebooks.length,
        success: insertedCount + updatedCount,
        inserted: insertedCount,
        updated: updatedCount,
        newRecords: newRecords,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error saving pricebooks:", error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Save pricebook details (product prices within a pricebook)
 */
async function savePricebookDetails(pricebookId, pricebookDetails) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    // Delete existing details for this pricebook
    await connection.execute(
      "DELETE FROM pricebook_details WHERE pricebookId = ?",
      [pricebookId]
    );

    let savedCount = 0;

    console.log(
      `Processing ${pricebookDetails.length} pricebook details for pricebook ${pricebookId}...`
    );

    for (const detail of pricebookDetails) {
      const { productId, productCode, price } = detail;

      if (!productId || price === undefined) {
        console.warn(
          "Skipping pricebook detail without productId or price:",
          detail
        );
        continue;
      }

      try {
        const detailQuery = `
          INSERT INTO pricebook_details
            (pricebookId, productId, productCode, price)
          VALUES (?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          pricebookId,
          productId,
          productCode || null,
          price,
        ]);

        savedCount++;
      } catch (detailError) {
        console.warn(
          `Warning: Could not save pricebook detail for product ${productId}: ${detailError.message}`
        );
      }
    }

    await connection.commit();

    console.log(
      `✅ Pricebook details sync completed: ${savedCount} details saved for pricebook ${pricebookId}`
    );

    return {
      success: true,
      savedCount: savedCount,
    };
  } catch (error) {
    await connection.rollback();
    console.error(
      `Error saving pricebook details for pricebook ${pricebookId}:`,
      error
    );
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update sync status for pricebooks
 * Exactly the same pattern as other entities
 */
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

/**
 * Get sync status for pricebooks
 * Exactly the same pattern as other entities
 */
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
  savePricebookDetails,
  updateSyncStatus,
  getSyncStatus,
};
