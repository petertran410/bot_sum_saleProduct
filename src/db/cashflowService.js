const { getPool } = require("../db.js");

// Validate and sanitize cashflow data based on actual API response
function validateAndSanitizeCashflow(cashflow) {
  return {
    ...cashflow,
    code: cashflow.code ? String(cashflow.code).substring(0, 50) : "",
    address: cashflow.address ? String(cashflow.address).substring(0, 500) : "",
    locationName: cashflow.locationName
      ? String(cashflow.locationName).substring(0, 100)
      : null,
    wardName: cashflow.wardName
      ? String(cashflow.wardName).substring(0, 100)
      : null,
    contactNumber: cashflow.contactNumber
      ? String(cashflow.contactNumber).substring(0, 20)
      : null,
    partnerName: cashflow.partnerName
      ? String(cashflow.partnerName).substring(0, 255)
      : "",
    statusValue: cashflow.statusValue
      ? String(cashflow.statusValue).substring(0, 50)
      : null,
    method: cashflow.method ? String(cashflow.method).substring(0, 50) : "",
    partnerType: cashflow.partnerType
      ? String(cashflow.partnerType).substring(0, 10)
      : "O",
    origin: cashflow.origin ? String(cashflow.origin).substring(0, 50) : null,
    cashGroup: cashflow.cashGroup
      ? String(cashflow.cashGroup).substring(0, 100)
      : null,
    amount: isNaN(Number(cashflow.amount)) ? 0 : Number(cashflow.amount),
    usedForFinancialReporting:
      cashflow.usedForFinancialReporting !== undefined
        ? Number(cashflow.usedForFinancialReporting)
        : 1,
    status: cashflow.status !== undefined ? Number(cashflow.status) : 0,
    branchId: cashflow.branchId ? Number(cashflow.branchId) : null,
    createdBy: cashflow.createdBy ? Number(cashflow.createdBy) : null,
    userId: cashflow.userId ? Number(cashflow.userId) : null,
    cashFlowGroupId: cashflow.cashFlowGroupId
      ? Number(cashflow.cashFlowGroupId)
      : null,
    partnerId: cashflow.partnerId ? Number(cashflow.partnerId) : null,
    accountId: cashflow.accountId ? Number(cashflow.accountId) : null,
    retailerId: cashflow.retailerId ? Number(cashflow.retailerId) : null,
  };
}

async function saveCashflows(cashflows) {
  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  const BATCH_SIZE = 50;

  try {
    await connection.beginTransaction();

    console.log(
      `Processing ${cashflows.length} cashflows in batches of ${BATCH_SIZE}`
    );

    // Get existing IDs for faster lookup
    const [existingCashflows] = await connection.execute(
      "SELECT id FROM cashflows"
    );
    const existingIds = new Set(existingCashflows.map((row) => row.id));

    // Process in batches
    for (let i = 0; i < cashflows.length; i += BATCH_SIZE) {
      const batch = cashflows.slice(i, i + BATCH_SIZE);

      for (const cashflow of batch) {
        try {
          // Validate and sanitize
          const validatedCashflow = validateAndSanitizeCashflow(cashflow);

          const isNew = !existingIds.has(validatedCashflow.id);

          if (isNew) {
            const result = await saveCashflow(validatedCashflow, connection);
            if (result.success) {
              successCount++;
              newCount++;
              existingIds.add(validatedCashflow.id);
            } else {
              failCount++;
              console.error(
                `Failed to save cashflow ${validatedCashflow.code}: ${result.error}`
              );
            }
          } else {
            // For existing records, you might want to update them
            // For now, we'll just count them
            successCount++;
          }
        } catch (error) {
          console.error(
            `Error processing cashflow ${cashflow.code || cashflow.id}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed cashflow batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          cashflows.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await connection.commit();
    console.log(
      `Cashflow sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Cashflow transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: cashflows.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

async function saveCashflow(cashflow, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const {
      id,
      code,
      address = "",
      locationName = null,
      branchId,
      wardName = null,
      contactNumber = null,
      createdBy,
      userId,
      usedForFinancialReporting = 1,
      accountId = null,
      origin = null,
      cashFlowGroupId = null,
      cashGroup = null,
      method,
      partnerType = "O",
      partnerId = null,
      retailerId,
      status,
      statusValue = null,
      transDate,
      amount,
      partnerName = "",
    } = cashflow;

    // Validate required fields
    if (
      !id ||
      !code ||
      !method ||
      !transDate ||
      amount === undefined ||
      amount === null
    ) {
      return {
        success: false,
        error: `Missing required fields: id=${id}, code=${code}, method=${method}, transDate=${transDate}, amount=${amount}`,
      };
    }

    const isReceipt = amount > 0 ? 1 : 0;
    const jsonData = JSON.stringify(cashflow);

    const query = `
      INSERT INTO cashflows 
        (id, code, address, locationName, branchId, wardName, contactNumber,
         createdBy, userId, usedForFinancialReporting, accountId, origin, 
         cashFlowGroupId, cashGroup, method, partnerType, partnerId, 
         retailerId, status, statusValue, transDate, amount, partnerName, 
         isReceipt, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        address = VALUES(address),
        locationName = VALUES(locationName),
        wardName = VALUES(wardName),
        contactNumber = VALUES(contactNumber),
        usedForFinancialReporting = VALUES(usedForFinancialReporting),
        accountId = VALUES(accountId),
        origin = VALUES(origin),
        cashFlowGroupId = VALUES(cashFlowGroupId),
        cashGroup = VALUES(cashGroup),
        method = VALUES(method),
        partnerType = VALUES(partnerType),
        partnerId = VALUES(partnerId),
        retailerId = VALUES(retailerId),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        transDate = VALUES(transDate),
        amount = VALUES(amount),
        partnerName = VALUES(partnerName),
        isReceipt = VALUES(isReceipt),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      address,
      locationName,
      branchId,
      wardName,
      contactNumber,
      createdBy,
      userId,
      usedForFinancialReporting,
      accountId,
      origin,
      cashFlowGroupId,
      cashGroup,
      method,
      partnerType,
      partnerId,
      retailerId,
      status,
      statusValue,
      transDate,
      amount,
      partnerName,
      isReceipt,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(
      `Error saving cashflow ${cashflow.code || cashflow.id}:`,
      error
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
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
      WHERE entity_type = 'cashflows'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('cashflows', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating cashflow sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["cashflows"]
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
    console.error("Error getting cashflow sync status:", error);
    throw error;
  }
}

module.exports = {
  saveCashflow,
  saveCashflows,
  updateSyncStatus,
  getSyncStatus,
};
