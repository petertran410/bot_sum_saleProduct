const fs = require("fs");
const path = require("path");
const { getPool } = require("../db");
const productService = require("./productService");
const orderService = require("./orderService");
const invoiceService = require("./invoiceService");

async function importJsonData() {
  try {
    console.log("Importing products...");
    const productsPath = path.join(__dirname, "../../saveJson/products.json");

    if (fs.existsSync(productsPath)) {
      const productsData = JSON.parse(fs.readFileSync(productsPath, "utf8"));

      let productCount = 0;

      if (Array.isArray(productsData)) {
        const result = await productService.saveProducts(productsData);
        productCount += result.stats.success;
      } else if (productsData.data && Array.isArray(productsData.data)) {
        const result = await productService.saveProducts(productsData.data);
        productCount += result.stats.success;
      } else {
        for (const entry of Object.values(productsData)) {
          if (entry.data && entry.data.data && Array.isArray(entry.data.data)) {
            const result = await productService.saveProducts(entry.data.data);
            productCount += result.stats.success;
          } else if (entry.data && Array.isArray(entry.data)) {
            const result = await productService.saveProducts(entry.data);
            productCount += result.stats.success;
          }
        }
      }

      console.log(`Imported ${productCount} products`);
    } else {
      console.log("No products.json file found");
    }

    console.log("Importing orders...");
    const ordersPath = path.join(__dirname, "../../saveJson/orders.json");

    if (fs.existsSync(ordersPath)) {
      const ordersData = JSON.parse(fs.readFileSync(ordersPath, "utf8"));

      let orderCount = 0;

      if (Array.isArray(ordersData)) {
        const result = await orderService.saveOrders(ordersData);
        orderCount += result.stats.success;
      } else if (ordersData.data && Array.isArray(ordersData.data)) {
        const result = await orderService.saveOrders(ordersData.data);
        orderCount += result.stats.success;
      } else {
        for (const entry of Object.values(ordersData)) {
          if (entry.data && entry.data.data && Array.isArray(entry.data.data)) {
            const result = await orderService.saveOrders(entry.data.data);
            orderCount += result.stats.success;
          } else if (entry.data && Array.isArray(entry.data)) {
            const result = await orderService.saveOrders(entry.data);
            orderCount += result.stats.success;
          }
        }
      }

      console.log(`Imported ${orderCount} orders`);
    } else {
      console.log("No orders.json file found");
    }

    console.log("Importing invoices...");
    const invoicesPath = path.join(__dirname, "../../saveJson/invoices.json");

    if (fs.existsSync(invoicesPath)) {
      const invoicesData = JSON.parse(fs.readFileSync(invoicesPath, "utf8"));

      let invoiceCount = 0;

      if (Array.isArray(invoicesData)) {
        const result = await invoiceService.saveInvoices(invoicesData);
        invoiceCount += result.stats.success;
      } else if (invoicesData.data && Array.isArray(invoicesData.data)) {
        const result = await invoiceService.saveInvoices(invoicesData.data);
        invoiceCount += result.stats.success;
      } else {
        for (const entry of Object.values(invoicesData)) {
          if (entry.date && entry.date.data && Array.isArray(entry.date.data)) {
            const result = await invoiceService.saveInvoices(entry.date.data);
            invoiceCount += result.stats.success;
          } else if (
            entry.data &&
            entry.data.data &&
            Array.isArray(entry.data.data)
          ) {
            const result = await invoiceService.saveInvoices(entry.data.data);
            invoiceCount += result.stats.success;
          } else if (entry.data && Array.isArray(entry.data)) {
            const result = await invoiceService.saveInvoices(entry.data);
            invoiceCount += result.stats.success;
          }
        }
      }

      console.log(`Imported ${invoiceCount} invoices`);
    } else {
      console.log("No invoices.json file found");
    }

    await productService.updateSyncStatus(true, new Date());
    await orderService.updateSyncStatus(true, new Date());
    await invoiceService.updateSyncStatus(true, new Date());

    console.log("JSON data import completed successfully");
    return true;
  } catch (error) {
    console.error("Error importing JSON data:", error);
    return false;
  }
}

if (require.main === module) {
  importJsonData().then((success) => {
    if (success) {
      console.log("Import complete");
    } else {
      console.error("Import failed");
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = { importJsonData };
