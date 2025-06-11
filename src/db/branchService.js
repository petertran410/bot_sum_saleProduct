const { getPool } = require("./connection");

const saveBranches = async (branches) => {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let insertedCount = 0;
    let updatedCount = 0;
    let newRecords = 0;

    for (const branch of branches) {
      const {
        id: branchId,
        branchName,
        branchCode,
        contactNumber,
        retailerId,
        email,
        address,
        modifiedDate,
        createdDate,
      } = branch;

      // Parse dates
      const branchModifiedDate = modifiedDate ? new Date(modifiedDate) : null;

      // Check if branch exists
      const [existingBranch] = await connection.execute(
        "SELECT id, modified_date FROM branches WHERE id = ?",
        [branchId]
      );

      if (existingBranch.length > 0) {
        const existing = existingBranch[0];
        const existingModified = existing.modified_date;

        // Update if branch is newer
        if (
          !existingModified ||
          (branchModifiedDate &&
            new Date(branchModifiedDate) > new Date(existingModified))
        ) {
          await connection.execute(
            `
            UPDATE branches SET 
              branch_name = ?,
              branch_code = ?,
              contact_number = ?,
              retailer_id = ?,
              email = ?,
              address = ?,
              modified_date = ?,
              raw_data = ?
            WHERE id = ?
          `,
            [
              branchName || null,
              branchCode || null,
              contactNumber || null,
              retailerId || null,
              email || null,
              address || null,
              branchModifiedDate,
              JSON.stringify(branch),
              branchId,
            ]
          );

          updatedCount++;
        }
      } else {
        // Insert new branch
        try {
          await connection.execute(
            `
            INSERT INTO branches (
              id, branch_name, branch_code, contact_number, 
              retailer_id, email, address, created_date, 
              modified_date, raw_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              branchId,
              branchName || null,
              branchCode || null,
              contactNumber || null,
              retailerId || null,
              email || null,
              address || null,
              createdDate ? new Date(createdDate) : null,
              branchModifiedDate,
              JSON.stringify(branch),
            ]
          );

          insertedCount++;
          newRecords++;
        } catch (insertError) {
          if (insertError.code === "ER_DUP_ENTRY") {
            console.warn(`Duplicate branch ID ${branchId}, skipping...`);
          } else {
            throw insertError;
          }
        }
      }
    }

    await connection.commit();

    console.log(
      `✅ Branch sync completed: ${insertedCount} inserted, ${updatedCount} updated`
    );

    return {
      success: true,
      stats: {
        total: branches.length,
        success: insertedCount + updatedCount,
        inserted: insertedCount,
        updated: updatedCount,
        newRecords: newRecords,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error saving branches:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getSyncStatus = async () => {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = 'branches'"
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: Boolean(rows[0].historical_completed),
      };
    }

    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } catch (error) {
    console.error("Error getting branch sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } finally {
    connection.release();
  }
};

const updateSyncStatus = async (historicalCompleted, lastSync = new Date()) => {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    await connection.execute(
      `
      INSERT INTO sync_status (entity_type, last_sync, historical_completed)
      VALUES ('branches', ?, ?)
      ON DUPLICATE KEY UPDATE
        last_sync = VALUES(last_sync),
        historical_completed = VALUES(historical_completed)
    `,
      [lastSync, historicalCompleted]
    );

    console.log("✅ Branch sync status updated");
  } catch (error) {
    console.error("Error updating branch sync status:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getBranches = async (limit = 100, offset = 0) => {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.execute(
      `
      SELECT * FROM branches 
      ORDER BY id 
      LIMIT ? OFFSET ?
    `,
      [limit, offset]
    );

    return rows;
  } catch (error) {
    console.error("Error getting branches:", error);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  saveBranches,
  getSyncStatus,
  updateSyncStatus,
  getBranches,
};
