// const mysql = require("mysql2/promise");
// require("dotenv").config();

// const dbConfig = {
//   host: process.env.DB_HOST || "localhost",
//   user: process.env.DB_USER || "admin",
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
//     console.log("Database connection successful");
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

// Cập nhật thông tin kết nối đến MariaDB trên NAS Synology
const dbConfig = {
  host: process.env.DB_HOST || "192.168.1.200",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Dieptra@123",
  database: process.env.DB_NAME || "kiotviet_data",
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
