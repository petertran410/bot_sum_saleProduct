const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeBankAccount(bankAccount) {
  return {
    ...bankAccount,
    bankName: bankAccount.bankName
      ? String(bankAccount.bankName).substring(0, 255)
      : "",
    accountNumber: bankAccount.accountNumber
      ? String(bankAccount.accountNumber).substring(0, 50)
      : "",
    description: bankAccount.description
      ? String(bankAccount.description).substring(0, 1000)
      : null,
  };
}

async function saveBankAccounts(bankAccounts) {
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
    for (let i = 0; i < bankAccounts.length; i += BATCH_SIZE) {
      const batch = bankAccounts.slice(i, i + BATCH_SIZE);

      for (const bankAccount of batch) {
        try {
          // Validate and sanitize
          const validatedBankAccount =
            validateAndSanitizeBankAccount(bankAccount);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM bank_accounts WHERE id = ?",
            [validatedBankAccount.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedBankAccount.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedBankAccount.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveBankAccount(
              validatedBankAccount,
              connection
            );
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
            `Error processing bank account ${bankAccount.bankName}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed bank account batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(bankAccounts.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Bank account sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Bank account transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: bankAccounts.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveBankAccount to accept connection parameter
async function saveBankAccount(bankAccount, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      bankName,
      accountNumber,
      description = null,
      retailerId,
      modifiedDate = null,
      createdDate = null,
    } = bankAccount;

    const jsonData = JSON.stringify(bankAccount);

    const query = `
      INSERT INTO bank_accounts 
        (id, bankName, accountNumber, description, retailerId, 
         modifiedDate, createdDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bankName = VALUES(bankName),
        accountNumber = VALUES(accountNumber),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      bankName,
      accountNumber,
      description,
      retailerId,
      modifiedDate,
      createdDate,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving bank account ${bankAccount.bankName}:`, error);
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
      WHERE entity_type = 'bank_accounts'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('bank_accounts', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating bank account sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["bank_accounts"]
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
    console.error("Error getting bank account sync status:", error);
    throw error;
  }
}

module.exports = {
  saveBankAccount,
  saveBankAccounts,
  updateSyncStatus,
  getSyncStatus,
};
