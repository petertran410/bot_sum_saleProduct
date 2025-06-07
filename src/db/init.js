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

    // Fix: Wrap database name in backticks to handle hyphens and special characters
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

    await connection.end();

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD,
      database: dbName, // No need for backticks here as mysql2 handles it
    });

    // Create categories table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        categoryId INT PRIMARY KEY,
        parentId INT,
        categoryName VARCHAR(125) NOT NULL,
        retailerId INT,
        hasChild BOOLEAN DEFAULT FALSE,
        modifiedDate DATETIME,
        createdDate DATETIME,
        jsonData JSON,
        INDEX idx_parentId (parentId),
        INDEX idx_retailerId (retailerId)
      )
    `);

    // Create branches table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id INT PRIMARY KEY,
        branchName VARCHAR(255) NOT NULL,
        branchCode VARCHAR(50),
        contactNumber VARCHAR(50),
        retailerId INT,
        email VARCHAR(100),
        address TEXT,
        modifiedDate DATETIME,
        createdDate DATETIME,
        jsonData JSON,
        INDEX idx_retailerId (retailerId),
        UNIQUE INDEX idx_branchCode (branchCode, retailerId)
      )
    `);

    // Create suppliers table - Fixed: escaped 'groups' keyword with backticks
    await connection.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        contactNumber VARCHAR(50),
        email VARCHAR(100),
        address TEXT,
        locationName VARCHAR(100),
        wardName VARCHAR(100),
        organization VARCHAR(255),
        taxCode VARCHAR(50),
        comments TEXT,
        \`groups\` TEXT,
        isActive BOOLEAN DEFAULT TRUE,
        modifiedDate DATETIME,
        createdDate DATETIME,
        retailerId BIGINT,
        branchId BIGINT,
        createdBy VARCHAR(255),
        debt DECIMAL(15,2) DEFAULT 0,
        totalInvoiced DECIMAL(15,2) DEFAULT 0,
        totalInvoicedWithoutReturn DECIMAL(15,2) DEFAULT 0,
        jsonData JSON,
        UNIQUE INDEX idx_code (code, retailerId),
        INDEX idx_retailerId (retailerId),
        INDEX idx_name (name)
      )
    `);

    // Create bank_accounts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT PRIMARY KEY,
        bankName VARCHAR(255) NOT NULL,
        accountNumber VARCHAR(50) NOT NULL,
        description TEXT,
        retailerId INT,
        modifiedDate DATETIME,
        createdDate DATETIME,
        jsonData JSON,
        INDEX idx_retailerId (retailerId),
        UNIQUE INDEX idx_account (accountNumber, retailerId)
      )
    `);

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
        UNIQUE INDEX (code),
        FOREIGN KEY (categoryId) REFERENCES categories(categoryId) ON DELETE SET NULL
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
        FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE CASCADE,
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
        FOREIGN KEY (soldById) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL
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
        FOREIGN KEY (soldById) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sync_status (
        entity_type VARCHAR(50) PRIMARY KEY,
        last_sync DATETIME,
        historical_completed BOOLEAN DEFAULT FALSE
      )
    `);

    await connection.query(`
  CREATE TABLE IF NOT EXISTS transfers (
    id BIGINT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    transferDate DATETIME,
    fromBranchId INT,
    fromBranchName VARCHAR(255),
    toBranchId INT,
    toBranchName VARCHAR(255),
    transferById BIGINT,
    transferByName VARCHAR(255),
    status INT,
    statusValue VARCHAR(50),
    description TEXT,
    createdDate DATETIME,
    modifiedDate DATETIME,
    retailerId INT,
    jsonData JSON,
    UNIQUE INDEX (code),
    INDEX idx_transferById (transferById),
    FOREIGN KEY (transferById) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (fromBranchId) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (toBranchId) REFERENCES branches(id) ON DELETE SET NULL
  )
`);

    await connection.query(`
  CREATE TABLE IF NOT EXISTS transfer_details (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transferId BIGINT,
    productId BIGINT,
    productCode VARCHAR(50),
    productName VARCHAR(255),
    quantity DECIMAL(15,2),
    transferQuantity DECIMAL(15,2),
    cost DECIMAL(15,2),
    note TEXT,
    FOREIGN KEY (transferId) REFERENCES transfers(id) ON DELETE CASCADE
  )
`);

    // RECEIPTS TABLES
    await connection.query(`
  CREATE TABLE IF NOT EXISTS receipts (
    id BIGINT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    receiptDate DATETIME,
    branchId INT,
    branchName VARCHAR(255),
    supplierId BIGINT,
    supplierName VARCHAR(255),
    createdById BIGINT,
    createdByName VARCHAR(255),
    status INT,
    statusValue VARCHAR(50),
    total DECIMAL(15,2),
    totalPayment DECIMAL(15,2),
    discount DECIMAL(15,2),
    description TEXT,
    retailerId INT,
    createdDate DATETIME,
    modifiedDate DATETIME,
    jsonData JSON,
    UNIQUE INDEX (code),
    INDEX idx_createdById (createdById),
    INDEX idx_supplierId (supplierId),
    FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL
  )
`);

    await connection.query(`
  CREATE TABLE IF NOT EXISTS receipt_details (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    receiptId BIGINT,
    productId BIGINT,
    productCode VARCHAR(50),
    productName VARCHAR(255),
    quantity DECIMAL(15,2),
    price DECIMAL(15,2),
    discount DECIMAL(15,2),
    discountRatio DECIMAL(5,2),
    note TEXT,
    FOREIGN KEY (receiptId) REFERENCES receipts(id) ON DELETE CASCADE
  )
`);

    // RETURNS TABLES
    await connection.query(`
  CREATE TABLE IF NOT EXISTS returns (
    id BIGINT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    returnDate DATETIME,
    branchId INT,
    branchName VARCHAR(255),
    customerId BIGINT,
    customerName VARCHAR(255),
    createdById BIGINT,
    createdByName VARCHAR(255),
    status INT,
    statusValue VARCHAR(50),
    total DECIMAL(15,2),
    totalPayment DECIMAL(15,2),
    discount DECIMAL(15,2),
    description TEXT,
    invoiceId BIGINT,
    invoiceCode VARCHAR(50),
    retailerId INT,
    createdDate DATETIME,
    modifiedDate DATETIME,
    jsonData JSON,
    UNIQUE INDEX (code),
    INDEX idx_createdById (createdById),
    INDEX idx_customerId (customerId),
    INDEX idx_invoiceId (invoiceId),
    FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE SET NULL
  )
`);

    await connection.query(`
  CREATE TABLE IF NOT EXISTS return_details (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    returnId BIGINT,
    productId BIGINT,
    productCode VARCHAR(50),
    productName VARCHAR(255),
    quantity DECIMAL(15,2),
    price DECIMAL(15,2),
    discount DECIMAL(15,2),
    discountRatio DECIMAL(5,2),
    note TEXT,
    returnReason VARCHAR(255),
    FOREIGN KEY (returnId) REFERENCES returns(id) ON DELETE CASCADE
  )
`);

    // SURCHARGES TABLE
    await connection.query(`
  CREATE TABLE IF NOT EXISTS surcharges (
    id BIGINT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    surchargeDate DATETIME,
    branchId INT,
    branchName VARCHAR(255),
    createdById BIGINT,
    createdByName VARCHAR(255),
    type INT,
    typeValue VARCHAR(50),
    amount DECIMAL(15,2),
    description TEXT,
    retailerId INT,
    createdDate DATETIME,
    modifiedDate DATETIME,
    jsonData JSON,
    UNIQUE INDEX (code),
    INDEX idx_createdById (createdById),
    FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (branchId) REFERENCES branches(id) ON DELETE SET NULL
  )
`);

    // Add new entity types to sync_status if they don't exist
    const newEntityTypes = [
      "categories",
      "branches",
      "suppliers",
      "bank_accounts",
      "transfers",
      "price_books",
      "purchase_orders",
      "receipts",
      "returns",
      "surcharges",
    ];

    for (const entityType of newEntityTypes) {
      const [rows] = await connection.query(
        "SELECT COUNT(*) as count FROM sync_status WHERE entity_type = ?",
        [entityType]
      );

      if (rows[0].count === 0) {
        await connection.query(
          `INSERT INTO sync_status (entity_type, last_sync, historical_completed) 
       VALUES (?, NULL, FALSE)`,
          [entityType]
        );
      }
    }

    // Add existing entity types if they don't exist
    const existingEntityTypes = [
      "users",
      "customers",
      "orders",
      "invoices",
      "products",
    ];

    for (const entityType of existingEntityTypes) {
      const [rows] = await connection.query(
        "SELECT COUNT(*) as count FROM sync_status WHERE entity_type = ?",
        [entityType]
      );

      if (rows[0].count === 0) {
        await connection.query(
          `
          INSERT INTO sync_status (entity_type, last_sync, historical_completed) 
            VALUES (?, NULL, FALSE)
        `,
          [entityType]
        );
      }
    }

    console.log("Database initialized successfully with all tables");
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
