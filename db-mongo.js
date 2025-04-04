// const { MongoClient } = require("mongodb");

// const uri = "mongodb://root:root@localhost:27017";
// const dbName = process.env.DB_NAME || "custom-order";
// const ordersCollection = process.env.DB_COLLECTION || "orders_tracking";

// let client;
// let collection;

// async function connectToDatabase() {
//   try {
//     // Kiểm tra kết nối hiện tại
//     if (client && client.topology && client.topology.isConnected()) {
//       console.log("Already connected to MongoDB");
//       return true;
//     }

//     // Đảm bảo các biến môi trường được đặt đúng
//     const dbName = process.env.DB_NAME || "custom-order";
//     const collectionName = process.env.DB_COLLECTION || "orders_tracking";

//     console.log(`Connecting to MongoDB: ${uri}`);
//     console.log(`Database: ${dbName}, Collection: ${collectionName}`);

//     // Kết nối mới
//     client = new MongoClient(uri, { useUnifiedTopology: true });
//     await client.connect();
//     console.log("Connected to MongoDB");

//     const db = client.db(dbName);

//     // Kiểm tra xem collection đã tồn tại chưa
//     const collections = await db
//       .listCollections({ name: collectionName })
//       .toArray();
//     if (collections.length === 0) {
//       console.log(`Collection ${collectionName} does not exist, creating...`);
//       await db.createCollection(collectionName);
//     }

//     collection = db.collection(collectionName);

//     // Tạo index cho trường code
//     await collection.createIndex({ code: 1 }, { unique: true });
//     console.log("Index created on 'code' field");

//     return true;
//   } catch (error) {
//     console.error("Error connecting to MongoDB:", error.message);
//     console.error(error.stack);
//     return false;
//   }
// }

// // async function transformOrderData(orders) {
// //   const transformedOrders = orders.map((order) => {
// //     const baseData = {
// //       code: order.code,
// //       soldByName: order.soldByName,
// //       createdDate: new Date(order.createdDate),
// //       description: order.description || "",
// //       total: order.total,
// //       status: order.status,
// //       statusValue: order.statusValue,
// //       modifiedDate: new Date(order.modifiedDate),
// //     };

// //     // Organize product details
// //     const productDetails = {};
// //     if (order.orderDetails && Array.isArray(order.orderDetails)) {
// //       order.orderDetails.forEach((product) => {
// //         productDetails[`${product.productName}`] = product.quantity;
// //       });
// //     }

// //     return {
// //       ...baseData,
// //       ...productDetails,
// //       last_updated: new Date(),
// //     };
// //   });

// //   return transformedOrders;
// // }

// async function transformOrderData(orders) {
//   return orders.map((order) => {
//     // Chuẩn bị dữ liệu cơ bản
//     const baseData = {
//       code: order.code, // Primary key
//       soldByName: order.soldByName || "Unknown", // Tên người tạo đơn
//       createdDate: new Date(order.purchaseDate || order.createdDate), // Ngày tạo đơn
//       description: order.description || "", // Nội dung thay đổi
//     };

//     // Thêm các cột sản phẩm
//     const productColumns = {};
//     if (order.orderDetails && Array.isArray(order.orderDetails)) {
//       order.orderDetails.forEach((product) => {
//         if (product.productName) {
//           // Sử dụng tên sản phẩm làm tên cột, số lượng làm giá trị
//           productColumns[`${product.productName}`] = product.quantity || 0;
//         }
//       });
//     }

//     // Kết hợp dữ liệu cơ bản với cột sản phẩm
//     return {
//       ...baseData,
//       ...productColumns,
//       last_updated: new Date(),
//     };
//   });
// }

// // async function saveOrdersWithProductColumns(orders) {
// //   try {
// //     if (!collection) {
// //       const connected = await connectToDatabase();
// //       if (!connected) return false;
// //     }

// //     if (!Array.isArray(orders) || orders.length === 0) {
// //       console.warn("No orders to save");
// //       return false;
// //     }

// //     const operations = orders.map((order) => ({
// //       updateOne: {
// //         filter: { code: order.code },
// //         update: { $set: order },
// //         upsert: true,
// //       },
// //     }));

// //     const result = await collection.bulkWrite(operations);
// //     console.log(
// //       `MongoDB result: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
// //     );
// //     return true;
// //   } catch (error) {
// //     console.error("Error saving orders with product columns:", error.message);
// //     throw error;
// //   }
// // }

// async function saveOrdersWithProductColumns(orders) {
//   try {
//     // Kiểm tra kết nối
//     if (!client || !collection) {
//       console.log("MongoDB connection not established, connecting now...");
//       const connected = await connectToDatabase();
//       if (!connected) {
//         console.error("Failed to connect to MongoDB");
//         return false;
//       }
//     }

//     if (!Array.isArray(orders) || orders.length === 0) {
//       console.warn("No orders to save");
//       return false;
//     }

//     // Biến đổi dữ liệu
//     const transformedOrders = await transformOrderData(orders);
//     console.log(
//       `Prepared ${transformedOrders.length} orders with product columns`
//     );

//     // Tạo các thao tác upsert (update hoặc insert)
//     const operations = transformedOrders.map((order) => ({
//       updateOne: {
//         filter: { code: order.code }, // Lọc theo mã đơn hàng
//         update: { $set: order },
//         upsert: true, // Tạo mới nếu không tồn tại
//       },
//     }));

//     // Thực hiện bulkWrite để tối ưu hiệu suất
//     if (operations.length > 0) {
//       const result = await collection.bulkWrite(operations);
//       console.log(
//         `MongoDB result: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
//       );
//       console.log("Orders saved successfully with product columns");
//       return true;
//     }

//     return false;
//   } catch (error) {
//     console.error("Error saving orders with product columns:", error.message);
//     console.error(error.stack);
//     return false;
//   }
// }

// async function getOldData() {
//   try {
//     if (!collection) {
//       await connectToDatabase();
//     }

//     const orders = await collection.find({}).toArray();
//     console.log(`Retrieved ${orders.length} orders from MongoDB`);

//     return orders;
//   } catch (error) {
//     console.error("Error getting old data:", error.message);
//     return [];
//   }
// }

// async function saveCurrentData(orders) {
//   try {
//     if (!collection) {
//       await connectToDatabase();
//     }

//     if (!orders || !Array.isArray(orders)) {
//       console.error("Invalid orders data");
//       return false;
//     }

//     // Transform order data to fit the desired schema
//     const transformedOrders = await transformOrderData(orders);

//     console.log(`Saving ${transformedOrders.length} orders to MongoDB`);

//     const operations = transformedOrders.map((order) => ({
//       updateOne: {
//         filter: { code: order.code },
//         update: { $set: order },
//         upsert: true,
//       },
//     }));

//     if (operations.length > 0) {
//       const result = await collection.bulkWrite(operations);
//       console.log(
//         `Orders saved: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
//       );
//     }

//     return true;
//   } catch (error) {
//     console.error("Error saving data to MongoDB:", error.message);
//     return false;
//   }
// }

// async function testConnection() {
//   try {
//     if (!client) {
//       await connectToDatabase();
//     }

//     // Ping database để kiểm tra kết nối
//     await client.db().admin().ping();
//     return true;
//   } catch (error) {
//     console.error("MongoDB connection test failed:", error.message);
//     return false;
//   }
// }

// function closeConnection() {
//   if (client) {
//     client.close();
//     console.log("MongoDB connection closed");
//   }
// }

// module.exports = {
//   connectToDatabase,
//   getOldData,
//   saveCurrentData,
//   closeConnection,
//   saveOrdersWithProductColumns,
//   testConnection,
// };

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
