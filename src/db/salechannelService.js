const { getPool } = require("../db.js");

const safeValue = (value) => {
  return value === undefined ? null : value;
};

function validateAndSanitizeSaleChannel(saleChannel) {
  return {
    ...saleChannel,
    id: saleChannel.id ? Number(saleChannel.id) : null,
    name: saleChannel.name ? String(saleChannel.name).substring(0, 255) : "",
    isActive: saleChannel.isActive !== undefined ? saleChannel.isActive : true,
    img: saleChannel.img ? String(saleChannel.img).substring(0, 500) : null,
    isNotDelete:
      saleChannel.isNotDelete !== undefined ? saleChannel.isNotDelete : false,
  };
}

async function saveSaleChannel(saleChannel, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    const pool = getPool();
    connection = await pool.getConnection();
  }

  try {
    const validatedSaleChannel = validateAndSanitizeSaleChannel(saleChannel);
    const { id, name, isActive, img, isNotDelete } = validatedSaleChannel;

    if (!id || !name) {
      throw new Error("Sale channel ID and name are required");
    }

    const jsonData = JSON.stringify(saleChannel);

    const query = `
      INSERT INTO sale_channels 
        (id, name, isActive, img, isNotDelete, jsonData)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        isActive = VALUES(isActive),
        img = VALUES(img),
        isNotDelete = VALUES(isNotDelete),
        jsonData = VALUES(jsonData)
    `;

    await connection.execute(query, [
      safeValue(id),
      safeValue(name),
      safeValue(isActive),
      safeValue(img),
      safeValue(isNotDelete),
      jsonData,
    ]);

    return { success: true };
  } catch (error) {
    console.error(
      `Failed to save sale channel ${saleChannel.name}:`,
      error.message
    );
    return { success: false, error: error.message };
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

async function saveSaleChannels(saleChannels) {
  if (
    !saleChannels ||
    !Array.isArray(saleChannels) ||
    saleChannels.length === 0
  ) {
    return {
      success: true,
      stats: {
        total: 0,
        success: 0,
        failed: 0,
        newRecords: 0,
        updatedRecords: 0,
      },
    };
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let updatedCount = 0;

  try {
    await connection.beginTransaction();

    for (const saleChannel of saleChannels) {
      try {
        const validatedSaleChannel =
          validateAndSanitizeSaleChannel(saleChannel);
        const { id } = validatedSaleChannel;

        if (!id) {
          console.warn("Skipping sale channel without ID");
          failCount++;
          continue;
        }

        const [existing] = await connection.execute(
          "SELECT id FROM sale_channels WHERE id = ?",
          [id]
        );

        const isNew = existing.length === 0;
        const result = await saveSaleChannel(validatedSaleChannel, connection);

        if (result.success) {
          successCount++;
          if (isNew) newCount++;
          else updatedCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(
          `Error processing sale channel ${saleChannel.name}:`,
          error.message
        );
        failCount++;
      }
    }

    await connection.commit();
    console.log(
      `Sale channel sync completed: ${newCount} new, ${updatedCount} updated, ${failCount} failed`
    );

    return {
      success: failCount === 0,
      stats: {
        total: saleChannels.length,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updatedRecords: updatedCount,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Sale channel batch save failed:", error);
    return {
      success: false,
      error: error.message,
      stats: {
        total: saleChannels.length,
        success: successCount,
        failed: failCount,
        newRecords: newCount,
        updatedRecords: updatedCount,
      },
    };
  } finally {
    connection.release();
  }
}

async function updateSyncStatus(completed = false, lastSync = new Date()) {
  const pool = getPool();

  try {
    const query = `
      UPDATE sync_status 
      SET last_sync = ?, historical_completed = ?
      WHERE entity_type = 'sale_channels'
    `;

    const [result] = await pool.execute(query, [lastSync, completed]);

    if (result.affectedRows === 0) {
      const insertQuery = `
        INSERT INTO sync_status (entity_type, last_sync, historical_completed)
        VALUES ('sale_channels', ?, ?)
        ON DUPLICATE KEY UPDATE last_sync = VALUES(last_sync), historical_completed = VALUES(historical_completed)
      `;
      await pool.execute(insertQuery, [lastSync, completed]);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating sale channel sync status:", error);
    return { success: false, error: error.message };
  }
}

async function getSyncStatus() {
  const pool = getPool();

  try {
    const [rows] = await pool.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = ?",
      ["sale_channels"]
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: rows[0].historical_completed === 1,
      };
    }

    return { lastSync: null, historicalCompleted: false };
  } catch (error) {
    console.error("Error getting sale channel sync status:", error);
    throw error;
  }
}

module.exports = {
  saveSaleChannel,
  saveSaleChannels,
  updateSyncStatus,
  getSyncStatus,
};
