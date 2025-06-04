const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeUser(user) {
  return {
    ...user,
    userName: user.userName ? String(user.userName).substring(0, 100) : "",
    givenName: user.givenName ? String(user.givenName).substring(0, 255) : "",
    address: user.address ? String(user.address).substring(0, 500) : null,
    mobilePhone: user.mobilePhone
      ? String(user.mobilePhone).substring(0, 50)
      : null,
    email: user.email ? String(user.email).substring(0, 100) : null,
    description: user.description
      ? String(user.description).substring(0, 1000)
      : null,
  };
}

async function saveUsers(users) {
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
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        try {
          // Validate and sanitize
          const validatedUser = validateAndSanitizeUser(user);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM users WHERE id = ?",
            [validatedUser.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedUser.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedUser.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveUser(validatedUser, connection);
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
            `Error processing user ${user.userName}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed user batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          users.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `User sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("User transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: users.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveUser to accept connection parameter
async function saveUser(user, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      userName,
      givenName,
      address = null,
      mobilePhone = null,
      email = null,
      description = null,
      retailerId,
      birthDate = null,
      createdDate = null,
      modifiedDate = null,
    } = user;

    const jsonData = JSON.stringify(user);

    const query = `
      INSERT INTO users 
        (id, userName, givenName, address, mobilePhone, email, description, 
         retailerId, birthDate, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        userName = VALUES(userName),
        givenName = VALUES(givenName),
        address = VALUES(address),
        mobilePhone = VALUES(mobilePhone),
        email = VALUES(email),
        description = VALUES(description),
        birthDate = VALUES(birthDate),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      userName,
      givenName,
      address,
      mobilePhone,
      email,
      description,
      retailerId,
      birthDate,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving user ${user.userName}:`, error);
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
      WHERE entity_type = 'users'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('users', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating user sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["users"]
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
    console.error("Error getting user sync status:", error);
    throw error;
  }
}

module.exports = {
  saveUser,
  saveUsers,
  updateSyncStatus,
  getSyncStatus,
};
