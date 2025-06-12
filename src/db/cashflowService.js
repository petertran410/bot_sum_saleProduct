const { getPool } = require("../db.js");

// Validate and sanitize cashflow data based on actual API response
function validateAndSanitizeCashflow(cashflow) {
  // Helper function to clean strings and handle emojis safely
  const sanitizeString = (str, maxLength) => {
    if (!str) return null;

    // Convert to string and handle emojis
    let cleaned = String(str);

    // Option 1: Keep emojis but truncate safely (RECOMMENDED)
    if (cleaned.length > maxLength) {
      // Safely truncate at character boundary, not byte boundary
      cleaned = cleaned.substring(0, maxLength);
    }

    return cleaned;
  };

  // Alternative helper function to remove emojis (if you prefer)
  const sanitizeStringNoEmoji = (str, maxLength) => {
    if (!str) return null;

    let cleaned = String(str);

    // Remove emojis and other 4-byte UTF-8 characters
    cleaned = cleaned.replace(
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
      ""
    );

    // Remove other problematic characters
    cleaned = cleaned.replace(/[\u{10000}-\u{10FFFF}]/gu, "");

    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }

    return cleaned;
  };

  return {
    ...cashflow,
    // ✅ SAFE STRING HANDLING WITH EMOJI SUPPORT:
    code: sanitizeString(cashflow.code, 50) || "",
    address: sanitizeString(cashflow.address, 500) || "", // ✅ Key fix for emoji addresses
    locationName: sanitizeString(cashflow.locationName, 100),
    wardName: sanitizeString(cashflow.wardName, 100),
    contactNumber: sanitizeString(cashflow.contactNumber, 20),
    partnerName: sanitizeString(cashflow.partnerName, 255) || "", // ✅ Another field that might have emojis
    statusValue: sanitizeString(cashflow.statusValue, 50),
    method: sanitizeString(cashflow.method, 50) || "",
    partnerType: sanitizeString(cashflow.partnerType, 10) || "O",
    origin: sanitizeString(cashflow.origin, 50),
    cashGroup: sanitizeString(cashflow.cashGroup, 100),

    // Numeric fields (unchanged)
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
    // ✅ Enhanced validation and sanitization
    const sanitizedCashflow = validateAndSanitizeCashflow(cashflow);

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
    } = sanitizedCashflow;

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
    const jsonData = JSON.stringify(sanitizedCashflow);

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
    // ✅ Enhanced error logging with data details
    console.error(
      `❌ Error saving cashflow ${cashflow.code || cashflow.id}:`,
      error.message
    );

    // Log problematic data for debugging
    if (error.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD") {
      console.error("📝 Problematic cashflow data:", {
        id: cashflow.id,
        code: cashflow.code,
        address: cashflow.address
          ? `"${cashflow.address.substring(0, 50)}..."`
          : null,
        partnerName: cashflow.partnerName
          ? `"${cashflow.partnerName.substring(0, 50)}..."`
          : null,
      });
    }

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
