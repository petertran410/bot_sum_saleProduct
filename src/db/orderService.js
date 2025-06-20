const { getPool } = require("../db");

// Add data validation
function validateAndSanitizeOrder(order) {
  return {
    ...order,
    code: order.code ? String(order.code).substring(0, 50) : "",
    customerName: order.customerName
      ? String(order.customerName).substring(0, 255)
      : null,
    total: isNaN(Number(order.total)) ? 0 : Number(order.total),
    totalPayment: isNaN(Number(order.totalPayment))
      ? 0
      : Number(order.totalPayment),
    // Add more validation as needed
  };
}

async function saveOrders(orders) {
  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;

  const BATCH_SIZE = 50; // Process in smaller batches

  try {
    await connection.beginTransaction();

    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);

      for (const order of batch) {
        try {
          // Validate and sanitize data
          const validatedOrder = validateAndSanitizeOrder(order);

          const [existing] = await connection.execute(
            "SELECT id FROM orders WHERE id = ?",
            [validatedOrder.id]
          );

          const isNew = existing.length === 0;

          if (isNew) {
            const result = await saveOrder(validatedOrder, connection);
            if (result.success) {
              successCount++;
              newCount++;
            } else {
              failCount++;
            }
          } else {
            // Check if update is needed based on modifiedDate
            const result = await saveOrder(validatedOrder, connection);
            if (result.success) {
              successCount++;
            } else {
              failCount++;
            }
          }
        } catch (error) {
          console.error(`Error processing order ${order.code}:`, error.message);
          failCount++;
        }
      }

      // Progress log
      console.log(
        `Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          orders.length / BATCH_SIZE
        )}`
      );

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Transaction failed:", error.message);
  } finally {
    connection.release();
  }

  return {
    success: failCount === 0,
    stats: {
      total: orders.length,
      success: successCount,
      newRecords: newCount,
      failed: failCount,
    },
  };
}

// Update saveOrder to accept connection parameter for transaction
async function saveOrder(order, connection = null) {
  const shouldReleaseConnection = !connection;

  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    await connection.beginTransaction();

    // Extract key fields from order
    const {
      id,
      code,
      purchaseDate,
      branchId,
      branchName = null,
      soldById = null,
      soldByName = null,
      customerId = null,
      customerCode = null,
      customerName = null,
      total = null,
      totalPayment = null,
      discount = null,
      discountRatio = null,
      status,
      statusValue = null,
      description = null,
      usingCod = false,
      saleChannelId = null,
      saleChannelName = null,
      PriceBookId = null,
      Extra = null,
      createdDate = null,
      modifiedDate = null,
    } = order;

    // Store the entire order as JSON
    const jsonData = JSON.stringify(order);

    const query = `
      INSERT INTO orders 
        (id, code, purchaseDate, branchId, branchName, soldById, soldByName, 
         customerId, customerCode, customerName, total, totalPayment, discount, discountRatio,
         status, statusValue, description, usingCod, saleChannelId, saleChannelName,
         priceBookId, extra, createdDate, modifiedDate, jsonData)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        purchaseDate = VALUES(purchaseDate),
        branchName = VALUES(branchName),
        soldById = VALUES(soldById),
        soldByName = VALUES(soldByName),
        customerId = VALUES(customerId),
        customerCode = VALUES(customerCode),
        customerName = VALUES(customerName),
        total = VALUES(total),
        totalPayment = VALUES(totalPayment),
        discount = VALUES(discount),
        discountRatio = VALUES(discountRatio),
        status = VALUES(status),
        statusValue = VALUES(statusValue),
        description = VALUES(description),
        usingCod = VALUES(usingCod),
        saleChannelId = VALUES(saleChannelId),
        saleChannelName = VALUES(saleChannelName),
        priceBookId = VALUES(priceBookId),
        extra = VALUES(extra),
        modifiedDate = VALUES(modifiedDate),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      id,
      code,
      purchaseDate,
      branchId,
      branchName,
      soldById,
      soldByName,
      customerId,
      customerCode,
      customerName,
      total,
      totalPayment,
      discount,
      discountRatio,
      status,
      statusValue,
      description,
      usingCod,
      saleChannelId,
      saleChannelName,
      PriceBookId,
      Extra,
      createdDate,
      modifiedDate,
      jsonData,
    ]);

    // First delete existing order details to avoid duplicates on update
    await connection.execute("DELETE FROM order_details WHERE orderId = ?", [
      id,
    ]);

    // Now handle order details if present
    if (order.orderDetails && Array.isArray(order.orderDetails)) {
      for (const detail of order.orderDetails) {
        const {
          productId,
          productCode,
          productName,
          quantity = 0,
          price = 0,
          discount = 0,
          discountRatio = 0,
          viewDiscount = 0,
          note = null,
        } = detail;

        const detailQuery = `
          INSERT INTO order_details 
            (orderId, productId, productCode, productName, quantity, 
             price, discount, discountRatio, viewDiscount, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(detailQuery, [
          id,
          productId,
          productCode,
          productName,
          quantity,
          price,
          discount,
          discountRatio,
          viewDiscount,
          note,
        ]);
      }
    }

    // Handle order delivery if present
    if (order.orderDelivery) {
      // First, delete any existing delivery record
      await connection.execute("DELETE FROM order_delivery WHERE orderId = ?", [
        id,
      ]);

      const delivery = order.orderDelivery;
      const {
        serviceType = "0",
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
        INSERT INTO order_delivery
          (orderId, serviceType, status, statusValue, receiver, contactNumber, 
           address, locationId, locationName, wardId, wardName, weight, length, 
           width, height, partnerDeliveryId, partnerDeliveryCode, partnerDeliveryName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(deliveryQuery, [
        id,
        serviceType,
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
        partnerDeliveryId,
        partnerDeliveryCode,
        partnerDeliveryName,
      ]);
    }

    // Handle payments if present
    if (order.payments && Array.isArray(order.payments)) {
      await connection.execute("DELETE FROM order_payments WHERE orderId = ?", [
        id,
      ]);

      for (const payment of order.payments) {
        const {
          id: paymentId,
          code: paymentCode,
          amount = 0,
          accountId = null,
          bankAccount = null,
          method = null,
          status: paymentStatus = 0,
          statusValue: paymentStatusValue = null,
          transDate = null,
        } = payment;

        const paymentQuery = `
          INSERT INTO order_payments 
            (id, orderId, code, amount, accountId, bankAccount, 
             method, status, statusValue, transDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.execute(paymentQuery, [
          paymentId,
          id,
          paymentCode,
          amount,
          accountId,
          bankAccount,
          method,
          paymentStatus,
          paymentStatusValue,
          transDate,
        ]);
      }
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    console.error(`Error saving order ${order.code}:`, error);
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
      WHERE entity_type = 'orders'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      console.warn(
        "No sync_status record was updated. Attempting to inserting"
      );

      const insertQuery = `INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES ('orders', ?, ?) ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)`;

      const [insertResult] = await pool.execute(insertQuery, [
        lastSync,
        completed,
      ]);
      console.log(`Sync status insert result: ${JSON.stringify(insertResult)}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating order sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["orders"]
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
    console.error("Error getting order sync status:", error);
    throw error;
  }
}

module.exports = {
  saveOrder,
  saveOrders,
  updateSyncStatus,
  getSyncStatus,
};
