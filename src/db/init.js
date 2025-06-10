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
      CREATE TABLE IF NOT EXISTS cashflows (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        address VARCHAR(500),
        locationName VARCHAR(100),
        branchId INT,
        wardName VARCHAR(100),
        contactNumber VARCHAR(20),
        createdBy BIGINT,
        userId BIGINT,
        usedForFinancialReporting INT DEFAULT 1,
        accountId INT,
        origin VARCHAR(50),
        cashFlowGroupId INT,
        cashGroup VARCHAR(100),
        method VARCHAR(50) NOT NULL,
        partnerType VARCHAR(10) DEFAULT 'O',
        partnerId BIGINT,
        retailerId INT,
        status INT DEFAULT 0,
        statusValue VARCHAR(50),
        transDate DATETIME NOT NULL,
        amount DECIMAL(15,4) NOT NULL,
        partnerName VARCHAR(255),
        isReceipt TINYINT DEFAULT 0,
        jsonData JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE     CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_branch (branchId),
        INDEX idx_trans_date (transDate),
        INDEX idx_partner (partnerId),
        INDEX idx_method (method),
        INDEX idx_status (status),
        INDEX idx_amount (amount),
        INDEX idx_receipt (isReceipt),
        INDEX idx_retailer (retailerId),
        INDEX idx_cashflow_group (cashFlowGroupId),
        INDEX idx_created_by (createdBy),
        INDEX idx_user_id (userId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        branchId INT,
        branchName VARCHAR(100),
        purchaseDate DATETIME,
        discountRatio DECIMAL(5,2),
        discount DECIMAL(15,2),
        total DECIMAL(15,2),
        supplierId BIGINT,
        supplierName VARCHAR(255),
        supplierCode VARCHAR(50),
        partnerType VARCHAR(10),
        purchaseById BIGINT,
        purchaseName VARCHAR(100),
        status INT DEFAULT 0,
        statusValue VARCHAR(50),
        description TEXT,
        isDraft BOOLEAN DEFAULT FALSE,
        paidAmount DECIMAL(15,2),
        paymentMethod VARCHAR(50),
        accountId BIGINT,
        retailerId INT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code),
        INDEX idx_branchId (branchId),
        INDEX idx_supplierId (supplierId),
        INDEX idx_purchaseById (purchaseById),
        INDEX idx_purchaseDate (purchaseDate),
        INDEX idx_retailerId (retailerId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        purchaseOrderId BIGINT,
        productId BIGINT,
        productCode VARCHAR(50),
        productName VARCHAR(255),
        quantity DECIMAL(15,2),
        price DECIMAL(15,2),
        discount DECIMAL(15,2),
        discountRatio DECIMAL(5,2),
        description TEXT,
        serialNumbers TEXT,
        FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        INDEX idx_productId (productId),
        INDEX idx_productCode (productCode)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_batch_expires (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        purchaseOrderDetailId BIGINT,
        productId BIGINT,
        batchName VARCHAR(100),
        fullNameVirgule VARCHAR(255),
        expireDate DATETIME,
        createdDate DATETIME,
        FOREIGN KEY (purchaseOrderDetailId) REFERENCES purchase_order_details (id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_payments (
        id BIGINT PRIMARY KEY,
        purchaseOrderId BIGINT,
        code VARCHAR(50),
        amount DECIMAL(15,2),
        method VARCHAR(50),
        status INT,
        statusValue VARCHAR(50),
        transDate DATETIME,
        accountId BIGINT,
        bankAccount VARCHAR(100),
        description TEXT,
        FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_surcharges (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        purchaseOrderId BIGINT,
        code VARCHAR(50),
        name VARCHAR(255),
        value DECIMAL(15,2),
        valueRatio DECIMAL(10,4),
        isSupplierExpense BOOLEAN DEFAULT FALSE,
        type INT,
        FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        status INT DEFAULT 0,
        transferredDate DATETIME,
        receivedDate DATETIME,
        createdById BIGINT,
        createdByName VARCHAR(255),
        fromBranchId BIGINT,
        fromBranchName VARCHAR(255),
        toBranchId BIGINT,
        toBranchName VARCHAR(255),
        noteBySource TEXT,
        noteByDestination TEXT,
        description TEXT,
        retailerId BIGINT,
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        UNIQUE INDEX (code),
        INDEX idx_fromBranchId (fromBranchId),
        INDEX idx_toBranchId (toBranchId),
        INDEX idx_transferredDate (transferredDate),
        INDEX idx_receivedDate (receivedDate),
        INDEX idx_status (status),
        INDEX idx_retailerId (retailerId),
        INDEX idx_createdById (createdById)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS transfer_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        transferId BIGINT,
        detailId BIGINT,
        productId BIGINT,
        productCode VARCHAR(50),
        productName VARCHAR(255),
        transferredQuantity DECIMAL(15,2) DEFAULT 0,
        price DECIMAL(15,2) DEFAULT 0,
        totalTransfer DECIMAL(15,2) DEFAULT 0,
        totalReceive DECIMAL(15,2) DEFAULT 0,
        sendQuantity DECIMAL(15,2) DEFAULT 0,
        receiveQuantity DECIMAL(15,2) DEFAULT 0,
        sendPrice DECIMAL(15,2) DEFAULT 0,
        receivePrice DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (transferId) REFERENCES transfers(id) ON DELETE CASCADE,
        INDEX idx_transferId (transferId),
        INDEX idx_productId (productId),
        INDEX idx_productCode (productCode)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sale_channels (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        isActive BOOLEAN DEFAULT TRUE,
        img VARCHAR(500),
        isNotDelete BOOLEAN DEFAULT FALSE,
        jsonData JSON,
        createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        modifiedDate DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE     CURRENT_TIMESTAMP,
        UNIQUE INDEX (name)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id BIGINT PRIMARY KEY,
        code VARCHAR(100) NOT NULL,
        invoiceId BIGINT,
        returnDate DATETIME,
        branchId INT,
        branchName VARCHAR(255),
        receivedById BIGINT,
        soldByName VARCHAR(255),
        customerId BIGINT,
        customerCode VARCHAR(100),
        customerName VARCHAR(255),
        returnTotal DECIMAL(15,2) DEFAULT 0,
        returnDiscount DECIMAL(15,2) DEFAULT 0,
        returnFee DECIMAL(15,2) DEFAULT 0,
        totalPayment DECIMAL(15,2) DEFAULT 0,
        status INT,
        statusValue VARCHAR(100),
        createdDate DATETIME,
        modifiedDate DATETIME,
        jsonData JSON,
        retailerId BIGINT,
        UNIQUE INDEX (code),
        INDEX idx_returnDate (returnDate),
        INDEX idx_branchId (branchId),
        INDEX idx_customerId (customerId),
        INDEX idx_status (status),
        INDEX idx_modifiedDate (modifiedDate)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS return_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        returnId BIGINT,
        productId BIGINT,
        productCode VARCHAR(100),
        productName VARCHAR(255),
        quantity DECIMAL(15,2) DEFAULT 0,
        price DECIMAL(15,2) DEFAULT 0,
        note TEXT,
        usePoint BOOLEAN DEFAULT FALSE,
        subTotal DECIMAL(15,2) DEFAULT 0,
        FOREIGN KEY (returnId) REFERENCES returns(id) ON DELETE CASCADE,
        INDEX idx_returnId (returnId),
        INDEX idx_productId (productId),
        INDEX idx_productCode (productCode)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS return_payments (
        id BIGINT PRIMARY KEY,
        returnId BIGINT,
        code VARCHAR(100),
        amount DECIMAL(15,2) DEFAULT 0,
        method VARCHAR(100),
        status TINYINT,
        statusValue VARCHAR(100),
        transDate DATETIME,
        bankAccount VARCHAR(255),
        accountId INT,
        description TEXT,
        FOREIGN KEY (returnId) REFERENCES returns(id) ON DELETE CASCADE,
        INDEX idx_returnId (returnId),
        INDEX idx_transDate (transDate)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_suppliers (
        id BIGINT PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        invoiceId BIGINT,
        orderDate DATETIME,
        branchId INT,
        retailerId INT,
        userId BIGINT,
        description TEXT,
        status INT,
        statusValue VARCHAR(50),
        discountRatio VARCHAR(10),
        productQty DECIMAL(15,2),
        discount DECIMAL(15,2),
        createdDate DATETIME,
        createdBy BIGINT,
        total DECIMAL(15,2),
        exReturnSuppliers DECIMAL(15,2),
        exReturnThirdParty DECIMAL(15,2),
        totalAmt DECIMAL(15,2),
        totalQty DECIMAL(15,2),
        totalQuantity DECIMAL(15,2),
        subTotal DECIMAL(15,2),
        paidAmount DECIMAL(15,2),
        toComplete BOOLEAN,
        viewPrice BOOLEAN,
        supplierDebt DECIMAL(15,2),
        supplierOldDebt DECIMAL(15,2),
        purchaseOrderCodes TEXT,
        jsonData JSON,
        UNIQUE INDEX (code),
        INDEX idx_orderDate (orderDate),
        INDEX idx_status (status),
        INDEX idx_createdBy (createdBy)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_supplier_details (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        orderSupplierId BIGINT,
        productId BIGINT,
        quantity DECIMAL(15,2),
        price DECIMAL(15,2),
        discount DECIMAL(15,2),
        allocation DECIMAL(15,2),
        createdDate DATETIME,
        description TEXT,
        orderByNumber INT,
        allocationSuppliers DECIMAL(15,2),
        allocationThirdParty DECIMAL(15,2),
        orderQuantity DECIMAL(15,2),
        subTotal DECIMAL(15,2),
        FOREIGN KEY (orderSupplierId) REFERENCES order_suppliers(id) ON DELETE CASCADE,
        INDEX idx_productId (productId)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_supplier_expenses_others (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        orderSupplierId BIGINT,
        form INT,
        expensesOtherOrder TINYINT,
        expensesOtherCode VARCHAR(50),
        expensesOtherName VARCHAR(255),
        expensesOtherId INT,
        price DECIMAL(15,2),
        isReturnAuto BOOLEAN,
        exValue DECIMAL(15,2),
        createdDate DATETIME,
        FOREIGN KEY (orderSupplierId) REFERENCES order_suppliers(id) ON DELETE CASCADE
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
      "surcharges",
      "orders",
      "invoices",
      "products",
      "cashflows",
      "purchase_orders",
      "transfers",
      "sale_channels",
      "returns",
      "order_suppliers",
    ];

    for (const entity of entities) {
      const [rows] = await connection.query(
        "SELECT COUNT(*) as count FROM sync_status WHERE entity_type = ?",
        [entity]
      );

      if (rows[0].count === 0) {
        await connection.query(
          "INSERT INTO sync_status (entity_type, last_sync, historical_completed) VALUES (?, NULL, FALSE) ON DUPLICATE KEY UPDATE entity_type = entity_type",
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
