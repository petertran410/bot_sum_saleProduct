const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizePriceBook(priceBook) {
  return {
    ...priceBook,
    name: priceBook.name ? String(priceBook.name).substring(0, 255) : "",
    description: priceBook.description
      ? String(priceBook.description).substring(0, 1000)
      : null,
  };
}

async function savePriceBooks(priceBooks) {
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
    for (let i = 0; i < priceBooks.length; i += BATCH_SIZE) {
      const batch = priceBooks.slice(i, i + BATCH_SIZE);

      for (const priceBook of batch) {
        try {
          // Validate and sanitize
          const validatedPriceBook = validateAndSanitizePriceBook(priceBook);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM price_books WHERE id = ?",
            [validatedPriceBook.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedPriceBook.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedPriceBook.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await savePriceBook(validatedPriceBook, connection);
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
            `Error processing price book ${priceBook.name}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed price book batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(priceBooks.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Price book sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Price book transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: priceBooks.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// FIXED: Update savePriceBook to properly handle undefined values
async function savePriceBook(priceBook, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Extract and convert all undefined to null
    const id = convertUndefinedToNull(priceBook.id);
    const name = convertUndefinedToNull(priceBook.name) || "";
    const description = convertUndefinedToNull(priceBook.description);
    const startDate = convertUndefinedToNull(priceBook.startDate);
    const endDate = convertUndefinedToNull(priceBook.endDate);
    const isActive = convertUndefinedToNull(priceBook.isActive) ?? true;
    const retailerId = convertUndefinedToNull(priceBook.retailerId);
    const createdDate = convertUndefinedToNull(priceBook.createdDate);
    const modifiedDate = convertUndefinedToNull(priceBook.modifiedDate);

    const jsonData = JSON.stringify(priceBook);

    const query = `
      INSERT INTO price_books 
        (id, name, description, startDate, endDate, isActive, 
         retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        startDate = VALUES(startDate),
        endDate = VALUES(endDate),
        isActive = VALUES(isActive),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      name,
      description,
      startDate,
      endDate,
      isActive,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle price book branches if present
    if (
      priceBook.priceBookBranches &&
      Array.isArray(priceBook.priceBookBranches)
    ) {
      await connection.execute(
        "DELETE FROM price_book_branches WHERE priceBookId = ?",
        [id]
      );

      for (const branch of priceBook.priceBookBranches) {
        const branchQuery = `
          INSERT INTO price_book_branches 
            (priceBookId, branchId, branchName)
          VALUES (?, ?, ?)
        `;

        await connection.execute(branchQuery, [
          id,
          convertUndefinedToNull(branch.branchId),
          convertUndefinedToNull(branch.branchName),
        ]);
      }
    }

    // Handle price book customer groups if present
    if (
      priceBook.priceBookCustomerGroups &&
      Array.isArray(priceBook.priceBookCustomerGroups)
    ) {
      await connection.execute(
        "DELETE FROM price_book_customer_groups WHERE priceBookId = ?",
        [id]
      );

      for (const customerGroup of priceBook.priceBookCustomerGroups) {
        const groupQuery = `
          INSERT INTO price_book_customer_groups 
            (priceBookId, customerGroupId, customerGroupName)
          VALUES (?, ?, ?)
        `;

        await connection.execute(groupQuery, [
          id,
          convertUndefinedToNull(customerGroup.customerGroupId),
          convertUndefinedToNull(customerGroup.customerGroupName),
        ]);
      }
    }

    // Handle price book users if present
    if (priceBook.priceBookUsers && Array.isArray(priceBook.priceBookUsers)) {
      await connection.execute(
        "DELETE FROM price_book_users WHERE priceBookId = ?",
        [id]
      );

      for (const user of priceBook.priceBookUsers) {
        const userQuery = `
          INSERT INTO price_book_users 
            (priceBookId, userId, userName)
          VALUES (?, ?, ?)
        `;

        await connection.execute(userQuery, [
          id,
          convertUndefinedToNull(user.userId),
          convertUndefinedToNull(user.userName),
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving price book ${priceBook.name}:`, error);
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
      WHERE entity_type = 'price_books'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('price_books', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating price book sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["price_books"]
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
    console.error("Error getting price book sync status:", error);
    throw error;
  }
}

module.exports = {
  savePriceBook,
  savePriceBooks,
  updateSyncStatus,
  getSyncStatus,
};
