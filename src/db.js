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

const dbConfig = {
  host: process.env.DB_HOST || "14.224.212.102",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Dieptra@123",
  database: process.env.DB_NAME || "kiotviet_data",
  // ✅ ADD THESE LINES:
  charset: "utf8mb4",
  // collation: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(dbConfig);

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Kết nối đến MariaDB trên NAS Synology thành công");
    connection.release();
    return true;
  } catch (error) {
    console.error("Kết nối đến MariaDB trên NAS Synology thất bại:", error);
    return false;
  }
}

function getPool() {
  return pool;
}

module.exports = {
  getPool,
  testConnection,
};
