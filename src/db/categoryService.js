const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeCategory(category) {
  return {
    ...category,
    categoryName: category.categoryName
      ? String(category.categoryName).substring(0, 125)
      : "",
    parentId: category.parentId || null,
  };
}

async function saveCategories(categories) {
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
    for (let i = 0; i < categories.length; i += BATCH_SIZE) {
      const batch = categories.slice(i, i + BATCH_SIZE);

      for (const category of batch) {
        try {
          // Validate and sanitize
          const validatedCategory = validateAndSanitizeCategory(category);

          const [existing] = await connection.execute(
            "SELECT categoryId, modifiedDate FROM categories WHERE categoryId = ?",
            [validatedCategory.categoryId]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedCategory.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedCategory.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveCategory(validatedCategory, connection);
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
            `Error processing category ${category.categoryName}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed category batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          categories.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Category sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Category transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: categories.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveCategory to accept connection parameter
async function saveCategory(category, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      categoryId,
      parentId = null,
      categoryName,
      retailerId,
      hasChild = false,
      modifiedDate = null,
      createdDate = null,
    } = category;

    const jsonData = JSON.stringify(category);

    const query = `
      INSERT INTO categories 
        (categoryId, parentId, categoryName, retailerId, hasChild, 
         modifiedDate, createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        parentId = VALUES(parentId),
        categoryName = VALUES(categoryName),
        hasChild = VALUES(hasChild),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      categoryId,
      parentId,
      categoryName,
      retailerId,
      hasChild,
      modifiedDate,
      createdDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving category ${category.categoryName}:`, error);
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
      WHERE entity_type = 'categories'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('categories', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating category sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["categories"]
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
    console.error("Error getting category sync status:", error);
    throw error;
  }
}

module.exports = {
  saveCategory,
  saveCategories,
  updateSyncStatus,
  getSyncStatus,
};
