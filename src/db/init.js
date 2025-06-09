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

    await connection.end();

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD,
      database: dbName,
    });

    // Create users table first since it's referenced by other tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        userName VARCHAR(100) NOT NULL,
        givenName VARCHAR(255) NOT NULL,
        address VARCHAR(500),
        mobilePhone VARCHAR(50),
        email VARCHAR(100),
        description VARCHAR(1000),
        retailerId INT,
        birthDate DATE,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (userName, retailerId),
        INDEX idx_retailerId (retailerId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        barCode VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        fullName VARCHAR(255),
        categoryId INT,
        categoryName VARCHAR(100),
        tradeMarkId INT,
        tradeMarkName VARCHAR(100),
        allowsSale BOOLEAN,
        type INT,
        hasVariants BOOLEAN,
        basePrice DECIMAL(15,2),
        unit VARCHAR(50),
        conversionValue DECIMAL(15,2),
        weight DECIMAL(15,2),
        description TEXT,
        isActive BOOLEAN,
        orderTemplate VARCHAR(500),
        isLotSerialControl BOOLEAN,
        isBatchExpireControl BOOLEAN,
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
        productName VARCHAR(255),
        branchId INT,
        branchName VARCHAR(100),
        cost DECIMAL(15,2),
        onHand DECIMAL(15,2),
        reserved DECIMAL(15,2),
        actualReserved DECIMAL(15,2),
        minQuantity DECIMAL(15,2),
        maxQuantity DECIMAL(15,2),
        isActive BOOLEAN,
        onOrder DECIMAL(15,2),
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE KEY (productId, branchId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS product_price_books (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        productId BIGINT,
        priceBookId BIGINT,
        priceBookName VARCHAR(255),
        price DECIMAL(15,2),
        isActive BOOLEAN,
        startDate DATETIME,
        endDate DATETIME,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
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
        discount DECIMAL(15,2),
        discountRatio DECIMAL(5,2),
        status INT,
        statusValue VARCHAR(50),
        description TEXT,
        usingCod BOOLEAN,
        saleChannelId INT,
        saleChannelName VARCHAR(100),
        priceBookId INT,
        extra TEXT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code),
        INDEX idx_soldById (soldById),
        FOREIGN KEY (soldById) REFERENCES users(id) ON DELETE SET NULL
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
        viewDiscount DECIMAL(15,2),
        note TEXT,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_delivery (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        orderId BIGINT,
        serviceType VARCHAR(10),
        status INT,
        statusValue VARCHAR(50),
        receiver VARCHAR(255),
        contactNumber VARCHAR(50),
        address TEXT,
        locationId INT,
        locationName VARCHAR(100),
        wardId INT,
        wardName VARCHAR(100),
        weight DECIMAL(10,2),
        length DECIMAL(10,2),
        width DECIMAL(10,2),
        height DECIMAL(10,2),
        partnerDeliveryId BIGINT,
        partnerDeliveryCode VARCHAR(50),
        partnerDeliveryName VARCHAR(255),
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
        orderId BIGINT,
        orderCode VARCHAR(50),
        total DECIMAL(15,2),
        totalPayment DECIMAL(15,2),
        discount DECIMAL(15,2),
        status INT,
        statusValue VARCHAR(50),
        description TEXT,
        usingCod BOOLEAN,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code),
        INDEX idx_soldById (soldById),
        FOREIGN KEY (soldById) REFERENCES users(id) ON DELETE SET NULL
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
        tradeMarkId INT,
        tradeMarkName VARCHAR(100),
        quantity DECIMAL(15,2),
        price DECIMAL(15,2),
        discount DECIMAL(15,2),
        discountRatio DECIMAL(5,2),
        usePoint BOOLEAN,
        subTotal DECIMAL(15,2),
        note TEXT,
        returnQuantity DECIMAL(15,2),
        serialNumbers TEXT,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoice_delivery (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        invoiceId BIGINT,
        serviceType VARCHAR(10),
        serviceTypeText VARCHAR(100),
        status INT,
        statusValue VARCHAR(50),
        receiver VARCHAR(255),
        contactNumber VARCHAR(50),
        address TEXT,
        locationId INT,
        locationName VARCHAR(100),
        wardId INT,
        wardName VARCHAR(100),
        weight DECIMAL(10,2),
        length DECIMAL(10,2),
        width DECIMAL(10,2),
        height DECIMAL(10,2),
        usingPriceCod BOOLEAN,
        partnerDeliveryId BIGINT,
        partnerDeliveryCode VARCHAR(50),
        partnerDeliveryName VARCHAR(255),
        FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_groups (
        id INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        discount DECIMAL(15,2),
        retailerId INT,
        createdBy BIGINT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE KEY unique_id (id),
        INDEX idx_retailerId (retailerId),
        INDEX idx_name (name)
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
        groupId INT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code),
        FOREIGN KEY (groupId) REFERENCES customer_groups(id) ON DELETE SET NULL,
        INDEX idx_groupId (groupId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customer_group_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        customerId BIGINT,
        groupId INT,
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (groupId) REFERENCES customer_groups(id) ON DELETE CASCADE,
        UNIQUE KEY unique_customer_group (customerId, groupId),
        INDEX idx_customerId (customerId),
        INDEX idx_groupId (groupId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS surcharges (
        id BIGINT PRIMARY KEY,
        surchargeCode VARCHAR(50) NOT NULL,
        surchargeName VARCHAR(255) NOT NULL,
        valueRatio DECIMAL(10,4) DEFAULT 0,
        value DECIMAL(15,2),
        retailerId INT,
        modifiedDate DATETIME,
        createdDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (surchargeCode, retailerId),
        INDEX idx_retailerId (retailerId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sync_status (
        entity_type VARCHAR(50) PRIMARY KEY,
        last_sync DATETIME,
        historical_completed BOOLEAN DEFAULT FALSE
      )
    `);

    const entities = [
      "users",
      "customers",
      "customer_groups",
      "surcharges",
      "orders",
      "invoices",
      "products",
    ];

    for (const entity of entities) {
      const [rows] = await connection.query(
        "SELECT COUNT(*) as count FROM sync_status WHERE entity_type = ?",
        [entity]
      );

      if (rows[0].count === 0) {
        await connection.query(
          "INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES (?, NULL, FALSE)",
          [entity]
        );
      }
    }

    return true;
  } catch (error) {
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
