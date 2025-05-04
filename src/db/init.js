const mysql = require("mysql2/promise");
require("dotenv").config();

async function initializeDatabase() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD,
    });

    const dbName = process.env.DB_NAME || "kiotviet_data";

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);

    await connection.end();

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD,
      database: dbName,
    });

    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        barCode VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        fullName VARCHAR(255),
        categoryId INT,
        categoryName VARCHAR(100),
        basePrice DECIMAL(15,2),
        unit VARCHAR(50),
        weight DECIMAL(15,2),
        isActive BOOLEAN,
        isLotSerialControl BOOLEAN,
        isBatchExpireControl BOOLEAN,
        type INT,
        retailerId INT,
        modifiedDate DATETIME,
        createdDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS product_inventories (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        productId BIGINT,
        productCode VARCHAR(50),
        branchId INT,
        branchName VARCHAR(100),
        cost DECIMAL(15,2),
        onHand DECIMAL(15,2),
        reserved DECIMAL(15,2),
        minQuantity DECIMAL(15,2),
        maxQuantity DECIMAL(15,2),
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE KEY (productId, branchId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        purchaseDate DATETIME,
        branchId INT,
        branchName VARCHAR(100),
        soldById BIGINT,
        soldByName VARCHAR(100),
        customerId BIGINT,
        customerCode VARCHAR(50),
        customerName VARCHAR(255),
        total DECIMAL(15,2),
        totalPayment DECIMAL(15,2),
        status INT,
        statusValue VARCHAR(50),
        usingCod BOOLEAN,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        orderId BIGINT,
        productId BIGINT,
        productCode VARCHAR(50),
        productName VARCHAR(255),
        quantity DECIMAL(15,2),
        price DECIMAL(15,2),
        discount DECIMAL(15,2),
        discountRatio DECIMAL(5,2),
        note TEXT,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_payments (
        id BIGINT PRIMARY KEY,
        orderId BIGINT,
        code VARCHAR(50),
        amount DECIMAL(15,2),
        accountId BIGINT,
        bankAccount VARCHAR(100),
        method VARCHAR(50),
        status INT,
        statusValue VARCHAR(50),
        transDate DATETIME,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id BIGINT PRIMARY KEY,
        uuid VARCHAR(50),
        code VARCHAR(50) NOT NULL,
        purchaseDate DATETIME,
        branchId INT,
        branchName VARCHAR(100),
        soldById BIGINT,
        soldByName VARCHAR(100),
        customerId BIGINT,
        customerCode VARCHAR(50),
        customerName VARCHAR(255),
        orderCode VARCHAR(50),
        total DECIMAL(15,2),
        totalPayment DECIMAL(15,2),
        status INT,
        statusValue VARCHAR(50),
        usingCod BOOLEAN,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoice_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        invoiceId BIGINT,
        productId BIGINT,
        productCode VARCHAR(50),
        productName VARCHAR(255),
        categoryId INT,
        categoryName VARCHAR(100),
        quantity DECIMAL(15,2),
        price DECIMAL(15,2),
        discount DECIMAL(15,2),
        subTotal DECIMAL(15,2),
        returnQuantity DECIMAL(15,2),
        serialNumbers TEXT,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sync_status (
        entity_type VARCHAR(50) PRIMARY KEY,
        last_sync DATETIME,
        historical_completed BOOLEAN DEFAULT FALSE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(50),
        email VARCHAR(100),
        address TEXT,
        gender BOOLEAN,
        birthDate DATE,
        locationName VARCHAR(100),
        wardName VARCHAR(100),
        organizationName VARCHAR(255),
        taxCode VARCHAR(50),
        comments TEXT,
        debt DECIMAL(15,2),
        rewardPoint INT,
        retailerId INT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_groups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        discount DECIMAL(5,2),
        retailerId INT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE KEY (name, retailerId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_group_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customerId BIGINT,
        groupId INT,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (groupId) REFERENCES customer_groups(id) ON DELETE CASCADE,
        UNIQUE KEY (customerId, groupId)
      )
    `);

    // Add customer entity to sync_status if it doesn't exist
    const [customerSyncRows] = await connection.query(
      "SELECT COUNT(*) as count FROM sync_status WHERE entity_type = 'customers'"
    );

    if (customerSyncRows[0].count === 0) {
      await connection.query(`
        INSERT INTO sync_status (entity_type, last_sync, historical_completed) 
          VALUES ('customers', NULL, FALSE)
      `);
    }

    const [rows] = await connection.query(
      "SELECT COUNT(*) as count FROM sync_status"
    );

    if (rows[0].count === 0) {
      await connection.query(`
        INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES 
        ('orders', NULL, FALSE),
        ('invoices', NULL, FALSE),
        ('products', NULL, FALSE)
      `);
    }

    console.log("Database initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing database:", error);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initializeDatabase().then((success) => {
    if (success) {
      console.log("Database setup complete");
    } else {
      console.error("Database setup failed");
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = { initializeDatabase };
