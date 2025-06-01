const { getPool } = require("../db");

// Add data validation and sanitization
function validateAndSanitizeInvoice(invoice) {
  return {
    ...invoice,
    code: invoice.code ? String(invoice.code).substring(0, 50) : "",
    customerName: invoice.customerName
      ? String(invoice.customerName).substring(0, 255)
      : null,
    customerCode: invoice.customerCode
      ? String(invoice.customerCode).substring(0, 50)
      : null,
    total: isNaN(Number(invoice.total)) ? 0 : Number(invoice.total),
    totalPayment: isNaN(Number(invoice.totalPayment))
      ? 0
      : Number(invoice.totalPayment),
    discount: isNaN(Number(invoice.discount)) ? 0 : Number(invoice.discount),
    description: invoice.description
      ? String(invoice.description).substring(0, 1000)
      : null,
  };
}

async function saveInvoices(invoices) {
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
    for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
      const batch = invoices.slice(i, i + BATCH_SIZE);

      for (const invoice of batch) {
        try {
          // Validate and sanitize
          const validatedInvoice = validateAndSanitizeInvoice(invoice);

          const [existing] = await connection.execute(
            "SELECT id, modifiedDate FROM invoices WHERE id = ?",
            [validatedInvoice.id]
          );

          const isNew = existing.length === 0;
          const isUpdated =
            !isNew &&
            new Date(validatedInvoice.modifiedDate) >
              new Date(existing[0].modifiedDate);

          if (isNew || isUpdated) {
            const result = await saveInvoice(validatedInvoice, connection);
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
            `Error processing invoice ${invoice.code}:`,
            error.message
          );
          failCount++;
        }
      }

      console.log(
        `Processed invoice batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          invoices.length / BATCH_SIZE
        )}`
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
    console.log(
      `Invoice sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );
  } catch (error) {
    await connection.rollback();
    console.error("Invoice transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: invoices.length,
      success: successCount,
      newRecords: newCount,
      updated: updatedCount,
      failed: failCount,
    },
  };
}

// Update saveInvoice to accept connection parameter
async function saveInvoice(invoice, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    // Extract key fields from invoice
    const {
      id,
      uuid = null,
      code,
      purchaseDate,
      branchId,
      branchName = null,
      soldById = null,
      soldByName = null,
      customerId = null,
      customerCode = null,
      customerName = null,
      orderId = null,
      orderCode = null,
      total = null,
      totalPayment = null,
      discount = null,
      status,
      statusValue = null,
      description = null,
      usingCod = false,
      createdDate = null,
      modifiedDate = null,
    } = invoice;

    // Store the entire invoice as JSON
    const jsonData = JSON.stringify(invoice);

    const query = `
      INSERT INTO invoices 
        (id, uuid, code, purchaseDate, branchId, branchName, soldById, soldByName, 
         customerId, customerCode, customerName, orderId, orderCode, total, totalPayment, discount,
         status, statusValue, description, usingCod, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        uuid = VALUES(uuid),
        purchaseDate = VALUES(purchaseDate),
        branchName = VALUES(branchName),
        soldById = VALUES(soldById),
        soldByName = VALUES(soldByName),
        customerId = VALUES(customerId),
        customerCode = VALUES(customerCode),
        customerName = VALUES(customerName),
        orderId = VALUES(orderId),
        orderCode = VALUES(orderCode),
        total = VALUES(total),
        totalPayment = VALUES(totalPayment),
        discount = VALUES(discount),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        description = VALUES(description),
        usingCod = VALUES(usingCod),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      uuid,
      code,
      purchaseDate,
      branchId,
      branchName,
      soldById,
      soldByName,
      customerId,
      customerCode,
      customerName,
      orderId,
      orderCode,
      total,
      totalPayment,
      discount,
      status,
      statusValue,
      description,
      usingCod,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // Handle invoice details if present
    if (invoice.invoiceDetails && Array.isArray(invoice.invoiceDetails)) {
      await connection.execute(
        "DELETE FROM invoice_details WHERE invoiceId = ?",
        [id]
      );

      for (const detail of invoice.invoiceDetails) {
        const detailQuery = `
          INSERT INTO invoice_details 
            (invoiceId, productId, productCode, productName, categoryId, categoryName,
             tradeMarkId, tradeMarkName, quantity, price, discount, discountRatio, usePoint,
             subTotal, note, returnQuantity, serialNumbers)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          detail.productId,
          detail.productCode,
          detail.productName,
          detail.categoryId || null,
          detail.categoryName || null,
          detail.tradeMarkId || null,
          detail.tradeMarkName || null,
          detail.quantity || 0,
          detail.price || 0,
          detail.discount || 0,
          detail.discountRatio || 0,
          detail.usePoint || false,
          detail.subTotal || 0,
          detail.note || null,
          detail.returnQuantity || 0,
          detail.serialNumbers || "",
        ]);
      }
    }

    // Handle invoice delivery if present
    if (invoice.invoiceDelivery) {
      await connection.execute(
        "DELETE FROM invoice_delivery WHERE invoiceId = ?",
        [id]
      );

      const delivery = invoice.invoiceDelivery;
      const deliveryQuery = `
        INSERT INTO invoice_delivery
          (invoiceId, serviceType, serviceTypeText, status, statusValue, receiver, contactNumber, 
           address, locationId, locationName, wardId, wardName, weight, length, 
           width, height, usingPriceCod, partnerDeliveryId, partnerDeliveryCode, partnerDeliveryName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(deliveryQuery, [
        id,
        delivery.serviceType || "0",
        delivery.serviceTypeText || null,
        delivery.status || 1,
        delivery.statusValue || "Chờ xử lý",
        delivery.receiver || null,
        delivery.contactNumber || null,
        delivery.address || null,
        delivery.locationId || null,
        delivery.locationName || null,
        delivery.wardId || null,
        delivery.wardName || null,
        delivery.weight || null,
        delivery.length || null,
        delivery.width || null,
        delivery.height || null,
        delivery.usingPriceCod || false,
        delivery.partnerDeliveryId || null,
        delivery.partnerDelivery?.code || null,
        delivery.partnerDelivery?.name || null,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error(`Error saving invoice ${invoice.code}:`, error);
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
      WHERE entity_type = 'invoices'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('invoices', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;

      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating invoice sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["invoices"]
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
    console.error("Error getting invoice sync status:", error);
    throw error;
  }
}

module.exports = {
  saveInvoice,
  saveInvoices,
  updateSyncStatus,
  getSyncStatus,
};
