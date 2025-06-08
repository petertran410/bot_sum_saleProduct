// src/db/damageReportService.js - NEW SERVICE
const { getPool } = require("../db");

// HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

// Add data validation and sanitization
function validateAndSanitizeDamageReport(damageReport) {
  return {
    ...damageReport,
    code: damageReport.code ? String(damageReport.code).substring(0, 50) : "",
    description: damageReport.description
      ? String(damageReport.description).substring(0, 1000)
      : null,
    branchName: damageReport.branchName
      ? String(damageReport.branchName).substring(0, 255)
      : null,
    createdByName: damageReport.createdByName
      ? String(damageReport.createdByName).substring(0, 255)
      : null,
    totalAmount: isNaN(Number(damageReport.totalAmount))
      ? 0
      : Number(damageReport.totalAmount),
  };
}

// Function to check if foreign key references exist
async function validateForeignKeys(damageReport, connection) {
  const validatedData = { ...damageReport };

  // Check if branchId exists
  if (validatedData.branchId) {
    const [branchExists] = await connection.execute(
      "SELECT id FROM branches WHERE id = ?",
      [validatedData.branchId]
    );
    if (branchExists.length === 0) {
      console.warn(
        `Branch ${validatedData.branchId} not found, setting to null`
      );
      validatedData.branchId = null;
    }
  }

  // Check if createdById exists
  if (validatedData.createdById) {
    const [userExists] = await connection.execute(
      "SELECT id FROM users WHERE id = ?",
      [validatedData.createdById]
    );
    if (userExists.length === 0) {
      console.warn(
        `User ${validatedData.createdById} not found, setting to null`
      );
      validatedData.createdById = null;
    }
  }

  return validatedData;
}

async function saveDamageReports(damageReports) {
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
    for (let i = 0; i < damageReports.length; i += BATCH_SIZE) {
      const batch = damageReports.slice(i, i + BATCH_SIZE);

      for (const damageReport of batch) {
        try {
          // Validate and sanitize
          const validatedDamageReport =
            validateAndSanitizeDamageReport(damageReport);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM damage_reports WHERE id = ?",
            [validatedDamageReport.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedDamageReport.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedDamageReport.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveDamageReport(
              validatedDamageReport,
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
            `Error processing damage report ${damageReport.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed damage report batch ${
          Math.floor(i / BATCH_SIZE) + 1
        }/${Math.ceil(damageReports.length / BATCH_SIZE)}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Damage report sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Damage report transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: damageReports.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveDamageReport to accept connection parameter
async function saveDamageReport(damageReport, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // Validate foreign keys before insertion
    const validatedDamageReport = await validateForeignKeys(
      damageReport,
      connection
    );

    // Extract and convert undefined to null
    const id = convertUndefinedToNull(validatedDamageReport.id);
    const code = convertUndefinedToNull(validatedDamageReport.code) || "";
    const damageDate = convertUndefinedToNull(validatedDamageReport.damageDate);
    const branchId = convertUndefinedToNull(validatedDamageReport.branchId);
    const branchName = convertUndefinedToNull(validatedDamageReport.branchName);
    const createdById = convertUndefinedToNull(
      validatedDamageReport.createdById
    );
    const createdByName = convertUndefinedToNull(
      validatedDamageReport.createdByName
    );
    const status = convertUndefinedToNull(validatedDamageReport.status);
    const statusValue = convertUndefinedToNull(
      validatedDamageReport.statusValue
    );
    const totalAmount = convertUndefinedToNull(
      validatedDamageReport.totalAmount
    );
    const description = convertUndefinedToNull(
      validatedDamageReport.description
    );
    const retailerId = convertUndefinedToNull(validatedDamageReport.retailerId);
    const createdDate = convertUndefinedToNull(
      validatedDamageReport.createdDate
    );
    const modifiedDate = convertUndefinedToNull(
      validatedDamageReport.modifiedDate
    );

    const jsonData = JSON.stringify(damageReport);

    const query = `
      INSERT INTO damage_reports 
        (id, code, damageDate, branchId, branchName, createdById, 
         createdByName, status, statusValue, totalAmount, description, 
         retailerId, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        damageDate = VALUES(damageDate),
        branchName = VALUES(branchName),
        createdByName = VALUES(createdByName),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        totalAmount = VALUES(totalAmount),
        description = VALUES(description),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      damageDate,
      branchId,
      branchName,
      createdById,
      createdByName,
      status,
      statusValue,
      totalAmount,
      description,
      retailerId,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle damage report details if present
    if (
      damageReport.damageReportDetails &&
      Array.isArray(damageReport.damageReportDetails)
    ) {
      await connection.execute(
        "DELETE FROM damage_report_details WHERE damageReportId = ?",
        [id]
      );

      for (const detail of damageReport.damageReportDetails) {
        const detailQuery = `
          INSERT INTO damage_report_details 
            (damageReportId, productId, productCode, productName, quantity, 
             cost, totalCost, damageReason, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          convertUndefinedToNull(detail.productId),
          convertUndefinedToNull(detail.productCode),
          convertUndefinedToNull(detail.productName),
          convertUndefinedToNull(detail.quantity) || 0,
          convertUndefinedToNull(detail.cost) || 0,
          convertUndefinedToNull(detail.totalCost) || 0,
          convertUndefinedToNull(detail.damageReason),
          convertUndefinedToNull(detail.note),
        ]);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving damage report ${damageReport.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

// updateSyncStatus and getSyncStatus functions
async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET 
        last_sync = ?,
        historical_completed = ?
      WHERE entity_type = 'damage_reports'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('damage_reports', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating damage report sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["damage_reports"]
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
    console.error("Error getting damage report sync status:", error);
    throw error;
  }
}

module.exports = {
  saveDamageReport,
  saveDamageReports,
  updateSyncStatus,
  getSyncStatus,
};
