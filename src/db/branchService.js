const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeBranch(branch) {
  return {
    ...branch,
    branchName: branch.branchName
      ? String(branch.branchName).substring(0, 255)
      : "",
    branchCode: branch.branchCode
      ? String(branch.branchCode).substring(0, 50)
      : "",
    contactNumber: branch.contactNumber
      ? String(branch.contactNumber).substring(0, 50)
      : null,
    email: branch.email ? String(branch.email).substring(0, 100) : null,
    address: branch.address ? String(branch.address).substring(0, 500) : null,
  };
}

async function saveBranches(branches) {
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
    for (let i = 0; i < branches.length; i += BATCH_SIZE) {
      const batch = branches.slice(i, i + BATCH_SIZE);

      for (const branch of batch) {
        try {
          // Validate and sanitize
          const validatedBranch = validateAndSanitizeBranch(branch);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM branches WHERE id = ?",
            [validatedBranch.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedBranch.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedBranch.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveBranch(validatedBranch, connection);
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
            `Error processing branch ${branch.branchName}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed branch batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          branches.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Branch sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Branch transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: branches.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveBranch to accept connection parameter
async function saveBranch(branch, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      branchName,
      branchCode,
      contactNumber = null,
      retailerId,
      email = null,
      address = null,
      modifiedDate = null,
      createdDate = null,
    } = branch;

    const jsonData = JSON.stringify(branch);

    const query = `
      INSERT INTO branches 
        (id, branchName, branchCode, contactNumber, retailerId, email, 
         address, modifiedDate, createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        branchName = VALUES(branchName),
        branchCode = VALUES(branchCode),
        contactNumber = VALUES(contactNumber),
        email = VALUES(email),
        address = VALUES(address),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      branchName,
      branchCode,
      contactNumber,
      retailerId,
      email,
      address,
      modifiedDate,
      createdDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving branch ${branch.branchName}:`, error);
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
      WHERE entity_type = 'branches'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('branches', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating branch sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["branches"]
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
    console.error("Error getting branch sync status:", error);
    throw error;
  }
}

module.exports = {
  saveBranch,
  saveBranches,
  updateSyncStatus,
  getSyncStatus,
};
