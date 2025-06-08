// const mysql = require("mysql2/promise");
// require("dotenv").config();

// const dbConfig = {
//   host: "localhost",
//   user: "admin",
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME || "kiotviet_data",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// };

// const pool = mysql.createPool(dbConfig);

// async function testConnection() {
//   try {
//     const connection = await pool.getConnection();
//     connection.release();
//     return true;
//   } catch (error) {
//     console.error("Database connection failed:", error);
//     return false;
//   }
// }

// function getPool() {
//   return pool;
// }

// module.exports = {
//   getPool,
//   testConnection,
// };

const mysql = require("mysql2/promise");
require("dotenv").config();

// FIXED: Better connection configuration with error handling
const dbConfig = {
  host: process.env.DB_HOST || "14.224.212.102",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Dieptra@123",
  database: process.env.DB_NAME || "kiotviet_data",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // FIXED: Add these important options
  acquireTimeout: 60000,
  timeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Handle disconnections
  reconnect: true,
  idleTimeout: 300000,
  // Character set
  charset: "utf8mb4",
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
  try {
    console.log("Testing database connection...");
    const connection = await pool.getConnection();

    // Test the connection with a simple query
    await connection.query("SELECT 1");

    console.log("✅ Kết nối đến MariaDB trên NAS Synology thành công");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Kết nối đến MariaDB trên NAS Synology thất bại:", {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      message: error.message,
    });
    return false;
  }
}

function getPool() {
  return pool;
}

// FIXED: Add graceful shutdown
process.on("SIGINT", async () => {
  console.log("Closing database pool...");
  await pool.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Closing database pool...");
  await pool.end();
  process.exit(0);
});

module.exports = {
  getPool,
  testConnection,
};
