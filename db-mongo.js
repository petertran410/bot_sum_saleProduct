const { MongoClient } = require("mongodb");

const uri = "mongodb://root:root@localhost:27017";
const dbName = process.env.DB_NAME;
const ordersCollection = process.env.DB_COLLECTIOn;

let client;
let collection;

async function connectToDatabase() {
  try {
    client = new MongoClient(uri);
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    collection = db.collection(ordersCollection);

    // Create a unique index on the order code
    await collection.createIndex({ code: 1 }, { unique: true });

    return true;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
    return false;
  }
}

async function transformOrderData(orders) {
  const transformedOrders = orders.map((order) => {
    const baseData = {
      code: order.code,
      soldByName: order.soldByName,
      createdDate: order.createdDate,
      description: order.description || "",
      total: order.total,
      status: order.status,
      statusValue: order.statusValue,
    };

    // Organize product details
    const productDetails = {};
    if (order.orderDetails && order.orderDetails.length > 0) {
      order.orderDetails.forEach((product, index) => {
        productDetails[`product_${index + 1}_name`] = product.productName;
        productDetails[`product_${index + 1}_quantity`] = product.quantity;
        productDetails[`product_${index + 1}_price`] = product.price;
        productDetails[`product_${index + 1}_id`] = product.productId;
      });
    }

    return {
      ...baseData,
      ...productDetails,
      last_updated: new Date(),
    };
  });

  return transformedOrders;
}

async function getOldData() {
  try {
    if (!collection) {
      await connectToDatabase();
    }

    const orders = await collection.find({}).toArray();
    console.log(`Retrieved ${orders.length} orders from MongoDB`);

    return orders;
  } catch (error) {
    console.error("Error getting old data:", error.message);
    return [];
  }
}

async function saveCurrentData(orders) {
  try {
    if (!collection) {
      await connectToDatabase();
    }

    if (!orders || !Array.isArray(orders)) {
      console.error("Invalid orders data");
      return false;
    }

    // Transform order data to fit the desired schema
    const transformedOrders = await transformOrderData(orders);

    console.log(`Saving ${transformedOrders.length} orders to MongoDB`);

    const operations = transformedOrders.map((order) => ({
      updateOne: {
        filter: { code: order.code },
        update: { $set: order },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      const result = await collection.bulkWrite(operations);
      console.log(
        `Orders saved: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
      );
    }

    return true;
  } catch (error) {
    console.error("Error saving data to MongoDB:", error.message);
    return false;
  }
}

function closeConnection() {
  if (client) {
    client.close();
    console.log("MongoDB connection closed");
  }
}

module.exports = {
  connectToDatabase,
  getOldData,
  saveCurrentData,
  closeConnection,
};
