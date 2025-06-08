const { getPool } = require("../db");
const {
  convertUndefinedToNull,
  validateString,
  validateNumber,
  validateBoolean,
} = require("./utils");

// Add data validation and sanitization
function validateAndSanitizeSupplier(supplier) {
  return {
    ...supplier,
    code: validateString(supplier.code, 50, ""),
    name: validateString(supplier.name, 255, ""),
    contactNumber: validateString(supplier.contactNumber, 50),
    email: validateString(supplier.email, 100),
    address: validateString(supplier.address, 500),
    locationName: validateString(supplier.locationName, 100),
    wardName: validateString(supplier.wardName, 100),
    organization: validateString(supplier.organization, 255),
    taxCode: validateString(supplier.taxCode, 50),
    comments: validateString(supplier.comments, 1000),
    debt: validateNumber(supplier.debt, 0),
    totalInvoiced: validateNumber(supplier.totalInvoiced, 0),
    totalInvoicedWithoutReturn: validateNumber(
      supplier.totalInvoicedWithoutReturn,
      0
    ),
  };
}

async function saveSuppliers(suppliers) {
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
    for (let i = 0; i < suppliers.length; i += BATCH_SIZE) {
      const batch = suppliers.slice(i, i + BATCH_SIZE);

      for (const supplier of batch) {
        try {
          // Validate and sanitize
          const validatedSupplier = validateAndSanitizeSupplier(supplier);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM suppliers WHERE id = ?",
            [validatedSupplier.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            validatedSupplier.modifiedDate &&
            existing[0].modifiedDate &&
            new Date(validatedSupplier.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveSupplier(validatedSupplier, connection);
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
            `Error processing supplier ${supplier.name}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed supplier batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          suppliers.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Supplier sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Supplier transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: suppliers.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// FIXED: Update saveSupplier to properly handle undefined values
async function saveSupplier(supplier, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // FIXED: Extract and convert all undefined to null
    const id = convertUndefinedToNull(supplier.id);
    const code = convertUndefinedToNull(supplier.code) || "";
    const name = convertUndefinedToNull(supplier.name) || "";
    const contactNumber = convertUndefinedToNull(supplier.contactNumber);
    const email = convertUndefinedToNull(supplier.email);
    const address = convertUndefinedToNull(supplier.address);
    const locationName = convertUndefinedToNull(supplier.locationName);
    const wardName = convertUndefinedToNull(supplier.wardName);
    const organization = convertUndefinedToNull(supplier.organization);
    const taxCode = convertUndefinedToNull(supplier.taxCode);
    const comments = convertUndefinedToNull(supplier.comments);
    const groups = convertUndefinedToNull(supplier.groups);
    const isActive = convertUndefinedToNull(supplier.isActive) ?? true;
    const modifiedDate = convertUndefinedToNull(supplier.modifiedDate);
    const createdDate = convertUndefinedToNull(supplier.createdDate);
    const retailerId = convertUndefinedToNull(supplier.retailerId);
    const branchId = convertUndefinedToNull(supplier.branchId);
    const createdBy = convertUndefinedToNull(supplier.createdBy);
    const debt = convertUndefinedToNull(supplier.debt) || 0;
    const totalInvoiced = convertUndefinedToNull(supplier.totalInvoiced) || 0;
    const totalInvoicedWithoutReturn =
      convertUndefinedToNull(supplier.totalInvoicedWithoutReturn) || 0;

    const jsonData = JSON.stringify(supplier);

    // Fixed: Use backticks around 'groups' column name since it's a reserved keyword
    const query = `
      INSERT INTO suppliers 
        (id, code, name, contactNumber, email, address, locationName, 
         wardName, organization, taxCode, comments, \`groups\`, isActive, 
         modifiedDate, createdDate, retailerId, branchId, createdBy, 
         debt, totalInvoiced, totalInvoicedWithoutReturn, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        contactNumber = VALUES(contactNumber),
        email = VALUES(email),
        address = VALUES(address),
        locationName = VALUES(locationName),
        wardName = VALUES(wardName),
        organization = VALUES(organization),
        taxCode = VALUES(taxCode),
        comments = VALUES(comments),
        \`groups\` = VALUES(\`groups\`),
        isActive = VALUES(isActive),
        modifiedDate = VALUES(modifiedDate),
        debt = VALUES(debt),
        totalInvoiced = VALUES(totalInvoiced),
        totalInvoicedWithoutReturn = VALUES(totalInvoicedWithoutReturn),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      name,
      contactNumber,
      email,
      address,
      locationName,
      wardName,
      organization,
      taxCode,
      comments,
      groups,
      isActive,
      modifiedDate,
      createdDate,
      retailerId,
      branchId,
      createdBy,
      debt,
      totalInvoiced,
      totalInvoicedWithoutReturn,
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(`Error saving supplier ${supplier.name}:`, error);
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
      WHERE entity_type = 'suppliers'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('suppliers', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating supplier sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["suppliers"]
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
    console.error("Error getting supplier sync status:", error);
    throw error;
  }
}

module.exports = {
  saveSupplier,
  saveSuppliers,
  updateSyncStatus,
  getSyncStatus,
};
