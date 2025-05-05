const { getPool } = require("../db");

async function saveInvoice(invoice) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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

    // First, delete existing invoice details to avoid duplicates on update
    await connection.execute(
      "DELETE FROM invoice_details WHERE invoiceId = ?",
      [id]
    );

    // Now handle invoice details if present
    if (invoice.invoiceDetails && Array.isArray(invoice.invoiceDetails)) {
      for (const detail of invoice.invoiceDetails) {
        const {
          productId,
          productCode,
          productName,
          categoryId = null,
          categoryName = null,
          tradeMarkId = null,
          tradeMarkName = null,
          quantity = 0,
          price = 0,
          discount = 0,
          discountRatio = 0,
          usePoint = false,
          subTotal = 0,
          note = null,
          returnQuantity = 0,
          serialNumbers = "",
        } = detail;

        const detailQuery = `
          INSERT INTO invoice_details 
            (invoiceId, productId, productCode, productName, categoryId, categoryName,
             tradeMarkId, tradeMarkName, quantity, price, discount, discountRatio, usePoint,
             subTotal, note, returnQuantity, serialNumbers)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          productId,
          productCode,
          productName,
          categoryId,
          categoryName,
          tradeMarkId,
          tradeMarkName,
          quantity,
          price,
          discount,
          discountRatio,
          usePoint,
          subTotal,
          note,
          returnQuantity,
          serialNumbers,
        ]);
      }
    }

    // Handle invoice delivery if present
    if (invoice.invoiceDelivery) {
      // First, delete any existing delivery record
      await connection.execute(
        "DELETE FROM invoice_delivery WHERE invoiceId = ?",
        [id]
      );

      const delivery = invoice.invoiceDelivery;
      const {
        serviceType = "0",
        serviceTypeText = null,
        status: deliveryStatus = 1,
        statusValue: deliveryStatusValue = "Chờ xử lý",
        receiver = null,
        contactNumber = null,
        address = null,
        locationId = null,
        locationName = null,
        wardId = null,
        wardName = null,
        weight = null,
        length = null,
        width = null,
        height = null,
        usingPriceCod = false,
        partnerDeliveryId = null,
      } = delivery;

      // Extract partner delivery info if present
      let partnerDeliveryCode = null;
      let partnerDeliveryName = null;

      if (delivery.partnerDelivery) {
        partnerDeliveryCode = delivery.partnerDelivery.code || null;
        partnerDeliveryName = delivery.partnerDelivery.name || null;
      }

      const deliveryQuery = `
        INSERT INTO invoice_delivery
          (invoiceId, serviceType, serviceTypeText, status, statusValue, receiver, contactNumber, 
           address, locationId, locationName, wardId, wardName, weight, length, 
           width, height, usingPriceCod, partnerDeliveryId, partnerDeliveryCode, partnerDeliveryName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(deliveryQuery, [
        id,
        serviceType,
        serviceTypeText,
        deliveryStatus,
        deliveryStatusValue,
        receiver,
        contactNumber,
        address,
        locationId,
        locationName,
        wardId,
        wardName,
        weight,
        length,
        width,
        height,
        usingPriceCod,
        partnerDeliveryId,
        partnerDeliveryCode,
        partnerDeliveryName,
      ]);
    }

    // Handle invoice surcharges if present
    if (
      invoice.invoiceOrderSurcharges &&
      Array.isArray(invoice.invoiceOrderSurcharges)
    ) {
      await connection.execute(
        "DELETE FROM invoice_surcharges WHERE invoiceId = ?",
        [id]
      );

      for (const surcharge of invoice.invoiceOrderSurcharges) {
        const {
          id: surchargeId,
          invoiceId,
          surchargeId: surchId,
          surchargeCode,
          surchargeName,
          surValue = 0,
          price = 0,
          createdDate: surchargeCreatedDate,
        } = surcharge;

        const surchargeQuery = `
          INSERT INTO invoice_surcharges 
            (id, invoiceId, surchargeId, surchargeCode, surchargeName, 
             surValue, price, createdDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(surchargeQuery, [
          surchargeId,
          id,
          surchId,
          surchargeCode,
          surchargeName,
          surValue,
          price,
          surchargeCreatedDate,
        ]);
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error(`Error saving invoice ${invoice.code}:`, error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

async function saveInvoices(invoices) {
  const pool = getPool();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;

  for (const invoice of invoices) {
    const [existing] = await pool.execute(
      "SELECT id, code FROM invoices WHERE id = ?",
      [invoice.id]
    );

    const isNew = existing.length === 0;
    const isUpdated =
      !isNew &&
      new Date(invoice.createdDate) > new Date(existing[0].createdDate);

    if (isNew || isUpdated) {
      const result = await saveInvoice(invoice);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  return {
    success: failCount === 0,
    stats: {
      total: invoices.length,
      success: successCount,
      newRecords: newCount,
      failed: failCount,
    },
  };
}

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
      console.warn(
        "No sync_status record was updated. Attempting to insert ..."
      );

      const insertQuery = `INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('invoices', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)`;

      const [insertResult] = await pool.execute(insertQuery, [
        lastSync,
        completed,
      ]);
      console.log(`Sync status insert result: ${JSON.stringify(insertResult)}`);
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
