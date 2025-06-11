const { getPool } = require("../db");

const saveProductOnHands = async (productOnHandsData) => {
  const pool = getPool();
  const connection = await pool.getConnection();

  const stats = {
    success: 0,
    errors: 0,
    newRecords: 0,
    updatedRecords: 0,
  };

  if (!Array.isArray(productOnHandsData)) {
    throw new Error("productOnHandsData must be an array");
  }

  for (const item of productOnHandsData) {
    try {
      const {
        id,
        code,
        createdDate,
        name,
        unit,
        basePrice,
        weight,
        modifiedDate,
        // Add other fields as they appear in the actual response
      } = item;

      // Check if record exists
      const [existing] = await connection.execute(
        "SELECT id FROM product_on_hands WHERE id = ?",
        [id]
      );

      const isNewRecord = existing.length === 0;

      const query = `
        INSERT INTO product_on_hands 
          (id, code, createdDate, name, unit, basePrice, weight, modifiedDate, jsonData)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          code = VALUES(code),
          createdDate = VALUES(createdDate),
          name = VALUES(name),
          unit = VALUES(unit),
          basePrice = VALUES(basePrice),
          weight = VALUES(weight),
          modifiedDate = VALUES(modifiedDate),
          jsonData = VALUES(jsonData)
      `;

      await connection.execute(query, [
        id,
        code,
        createdDate,
        name,
        unit,
        basePrice || 0,
        weight || 0,
        modifiedDate,
        JSON.stringify(item),
      ]);

      if (isNewRecord) {
        stats.newRecords++;
      } else {
        stats.updatedRecords++;
      }
      stats.success++;
    } catch (error) {
      console.error(`Error saving productOnHands ${item.id}:`, error.message);
      stats.errors++;
    }
  }

  return { stats };
};

const getSyncStatus = async () => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT * FROM sync_status WHERE entity_type = 'product_on_hands'"
    );

    if (rows.length === 0) {
      return {
        lastSync: null,
        historicalCompleted: false,
      };
    }

    return {
      lastSync: rows[0].last_sync,
      historicalCompleted: rows[0].historical_completed,
    };
  } catch (error) {
    console.error("Error getting productOnHands sync status:", error);
    return {
      lastSync: null,
      historicalCompleted: false,
    };
  }
};

const updateSyncStatus = async (historicalCompleted, lastSync) => {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.execute(
      `INSERT INTO sync_status (entity_type, historical_completed, last_sync) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
         historical_completed = VALUES(historical_completed), 
         last_sync = VALUES(last_sync)`,
      ["product_on_hands", historicalCompleted, lastSync]
    );
  } catch (error) {
    console.error("Error updating productOnHands sync status:", error);
    throw error;
  }
};

module.exports = {
  saveProductOnHands,
  getSyncStatus,
  updateSyncStatus,
};
