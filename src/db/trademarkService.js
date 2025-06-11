// src/db/trademarkService.js
const { getPool } = require("../db");

const saveTrademarks = async (trademarks) => {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    let insertedCount = 0;
    let updatedCount = 0;
    let newRecords = 0;

    console.log(`Processing ${trademarks.length} trademarks...`);

    for (const trademark of trademarks) {
      const { tradeMarkId, tradeMarkName, createdDate, modifiedDate } =
        trademark;

      if (!tradeMarkId) {
        console.warn("Skipping trademark without ID:", trademark);
        continue;
      }

      // Check if trademark already exists
      const [existingRows] = await connection.execute(
        "SELECT id, modifiedDate FROM trademarks WHERE id = ?",
        [tradeMarkId]
      );

      const existingTrademark = existingRows[0];
      const trademarkModifiedDate = modifiedDate
        ? new Date(modifiedDate)
        : null;

      if (existingTrademark) {
        // Update if modified date is newer
        if (
          trademarkModifiedDate &&
          (!existingTrademark.modifiedDate ||
            trademarkModifiedDate > existingTrademark.modifiedDate)
        ) {
          const [result] = await connection.execute(
            `
            UPDATE trademarks SET 
              name = ?,
              createdDate = ?,
              modifiedDate = ?,
              jsonData = ?
            WHERE id = ?
          `,
            [
              tradeMarkName || null,
              createdDate ? new Date(createdDate) : null,
              trademarkModifiedDate,
              JSON.stringify(trademark),
              tradeMarkId,
            ]
          );

          if (result.affectedRows > 0) {
            updatedCount++;
          }
        }
      } else {
        // Insert new trademark
        try {
          await connection.execute(
            `
            INSERT INTO trademarks (
              id, name, createdDate, modifiedDate, jsonData
            ) VALUES (?, ?, ?, ?, ?)
          `,
            [
              tradeMarkId,
              tradeMarkName || null,
              createdDate ? new Date(createdDate) : null,
              trademarkModifiedDate,
              JSON.stringify(trademark),
            ]
          );

          insertedCount++;
          newRecords++;
        } catch (insertError) {
          if (insertError.code === "ER_DUP_ENTRY") {
            console.warn(`Duplicate trademark ID ${tradeMarkId}, skipping...`);
          } else {
            throw insertError;
          }
        }
      }
    }

    await connection.commit();

    console.log(
      `✅ Trademark sync completed: ${insertedCount} inserted, ${updatedCount} updated`
    );

    return {
      success: true,
      stats: {
        total: trademarks.length,
        success: insertedCount + updatedCount,
        inserted: insertedCount,
        updated: updatedCount,
        newRecords: newRecords,
      },
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error saving trademarks:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getSyncStatus = async () => {
  const connection = await getPool().getConnection();

  try {
    const [rows] = await connection.execute(
      "SELECT last_sync, historical_completed FROM sync_status WHERE entity_type = 'trademarks'"
    );

    if (rows.length > 0) {
      return {
        lastSync: rows[0].last_sync,
        historicalCompleted: Boolean(rows[0].historical_completed),
      };
    }

    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } catch (error) {
    console.error("Error getting trademark sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
    };
  } finally {
    connection.release();
  }
};

const updateSyncStatus = async (historicalCompleted, lastSync = new Date()) => {
  const connection = await getPool().getConnection();

  try {
    await connection.execute(
      `
      INSERT INTO sync_status (entity_type, last_sync, historical_completed)
      VALUES ('trademarks', ?, ?)
      ON DUPLICATE KEY UPDATE
        last_sync = VALUES(last_sync),
        historical_completed = VALUES(historical_completed)
    `,
      [lastSync, historicalCompleted]
    );

    console.log("✅ Trademark sync status updated");
  } catch (error) {
    console.error("Error updating trademark sync status:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getTrademarks = async (limit = 100, offset = 0) => {
  const connection = await getPool().getConnection();

  try {
    const [rows] = await connection.execute(
      `
      SELECT * FROM trademarks 
      ORDER BY id 
      LIMIT ? OFFSET ?
    `,
      [limit, offset]
    );

    return rows;
  } catch (error) {
    console.error("Error getting trademarks:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getTrademarkById = async (id) => {
  const connection = await getPool().getConnection();

  try {
    const [rows] = await connection.execute(
      "SELECT * FROM trademarks WHERE id = ?",
      [id]
    );

    return rows[0] || null;
  } catch (error) {
    console.error("Error getting trademark by ID:", error);
    throw error;
  } finally {
    connection.release();
  }
};

const getTrademarkCount = async () => {
  const connection = await getPool().getConnection();

  try {
    const [rows] = await connection.execute(
      "SELECT COUNT(*) as count FROM trademarks"
    );
    return rows[0].count;
  } catch (error) {
    console.error("Error getting trademark count:", error);
    return 0;
  } finally {
    connection.release();
  }
};

module.exports = {
  saveTrademarks,
  getSyncStatus,
  updateSyncStatus,
  getTrademarks,
  getTrademarkById,
  getTrademarkCount,
};
