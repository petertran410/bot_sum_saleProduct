// // src/index.js
// require("dotenv").config();
// const express = require("express");
// const kiotviet = require("./kiotviet");
// const lark = require("./lark");
// const scheduler = require("./scheduler");
// const db = require("../db-mongo.js");
// const https = require("https");
// const fs = require("fs");
// const path = require("path");

// const app = express();

// const options = {
//   key: fs.readFileSync("ssl/ssl/key.pem"),
//   cert: fs.readFileSync("ssl/ssl/cert.pem"),
// };

// app.use(express.static(path.join(__dirname, "public")));

// app.get("/", (req, res) => {
//   res.send("KiotViet-Lark Integration Server is running!");
// });

// const PORT = 3443;
// const server = https.createServer(options, app);

// app.get("/test-simple-message", async (req, res) => {
//   try {
//     await lark.sendTestMessage();
//     res.status(200).json({ message: "Test message sent" });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.get("/run-report", async (req, res) => {
//   try {
//     await scheduler.runReportNow();
//     res.status(200).json({ message: "Report triggered successfully" });
//   } catch (error) {
//     console.error("Error triggering report:", error.message);
//     res.status(500).json({ error: "Failed to trigger report" });
//   }
// });

// app.get("/check-status", (req, res) => {
//   try {
//     let lastOrders = [];
//     let fileExists = false;

//     if (fs.existsSync("./lastOrders.json")) {
//       fileExists = true;
//       const data = fs.readFileSync("./lastOrders.json", "utf8");
//       if (data && data.trim() !== "") {
//         lastOrders = JSON.parse(data);
//       }
//     }

//     res.status(200).json({
//       status: "OK",
//       storagePath: process.cwd(),
//       lastDataFileExists: fileExists,
//       lastOrdersCount: lastOrders.length,
//       lastDataUpdated: fileExists
//         ? fs.statSync("./lastOrders.json").mtime
//         : null,
//       currentTime: new Date(),
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: "ERROR",
//       error: error.message,
//     });
//   }
// });

// // Trong file index.js, route xử lý webhook
// // app.post("/webhook/kiotviet", express.json(), async (req, res) => {
// //   try {
// //     console.log("Webhook received:", JSON.stringify(req.body));

// //     // Cập nhật thời gian nhận webhook
// //     scheduler.updateWebhookReceived();

// //     // Xử lý dữ liệu từ webhook
// //     if (req.body && req.body.Notifications) {
// //       for (const notification of req.body.Notifications) {
// //         if (notification.Action === "order.update" && notification.Data) {
// //           console.log(
// //             `Processing ${notification.Data.length} orders from webhook`
// //           );

// //           // Chuyển đổi dữ liệu theo định dạng bảng như bạn muốn
// //           const transformedOrders = notification.Data.map((order) => {
// //             // Chuẩn bị dữ liệu cơ bản
// //             const baseData = {
// //               code: order.Code,
// //               soldByName: order.SoldByName,
// //               createdDate: new Date(order.PurchaseDate || order.CreatedDate),
// //               description: order.Description || "",
// //             };

// //             // Thêm các cột sản phẩm
// //             const productColumns = {};
// //             if (order.OrderDetails && Array.isArray(order.OrderDetails)) {
// //               order.OrderDetails.forEach((product) => {
// //                 // Sử dụng tên sản phẩm làm tên cột, số lượng làm giá trị
// //                 productColumns[product.ProductName] = product.Quantity;
// //               });
// //             }

// //             // Kết hợp dữ liệu cơ bản với cột sản phẩm
// //             return {
// //               ...baseData,
// //               ...productColumns,
// //               last_updated: new Date(),
// //             };
// //           });

// //           // Lưu vào MongoDB
// //           try {
// //             await db.saveOrdersWithProductColumns(transformedOrders);
// //             console.log(
// //               `Successfully saved ${transformedOrders.length} orders to MongoDB`
// //             );
// //           } catch (dbError) {
// //             console.error("Error saving to MongoDB:", dbError.message);
// //           }
// //         }
// //       }
// //     }

// //     res.status(200).json({ status: "success" });
// //   } catch (error) {
// //     console.error("Webhook processing error:", error);
// //     res.status(200).json({ status: "error", message: error.message });
// //   }
// // });

// app.post("/webhook/kiotviet", express.json(), async (req, res) => {
//   try {
//     console.log("Webhook received:", JSON.stringify(req.body));

//     // Xử lý dữ liệu từ webhook
//     if (req.body && req.body.Notifications) {
//       for (const notification of req.body.Notifications) {
//         if (notification.Action === "order.update" && notification.Data) {
//           console.log(
//             `Processing ${notification.Data.length} orders from webhook`
//           );

//           try {
//             // Lưu vào MongoDB
//             const saved = await db.saveOrdersWithProductColumns(
//               notification.Data
//             );
//             if (saved) {
//               console.log(
//                 `Successfully saved ${notification.Data.length} orders to MongoDB`
//               );
//             } else {
//               console.error("Failed to save orders to MongoDB");
//             }
//           } catch (dbError) {
//             console.error("Error saving to MongoDB:", dbError.message);
//           }
//         }
//       }
//     }

//     // KiotViet cần nhận phản hồi 200 để biết webhook đã được xử lý
//     res.status(200).json({ status: "success" });
//   } catch (error) {
//     console.error("Webhook processing error:", error);
//     // Vẫn trả về 200 để KiotViet không gửi lại webhook
//     res.status(200).json({ status: "error", message: error.message });
//   }
// });

// // Thêm route để kiểm tra webhook
// // app.get("/mongodb-status", async (req, res) => {
// //   try {
// //     // Kiểm tra kết nối
// //     const isConnected = await db.testConnection();

// //     if (!isConnected) {
// //       return res.status(500).json({
// //         status: "error",
// //         message: "Could not connect to MongoDB",
// //       });
// //     }

// //     // Lấy dữ liệu mẫu
// //     const data = await db.collection.find({}).limit(5).toArray();

// //     res.status(200).json({
// //       status: "success",
// //       connected: true,
// //       collectionName: process.env.DB_COLLECTION || "orders_tracking",
// //       databaseName: process.env.DB_NAME || "custom-order",
// //       sampleData: data,
// //       recordCount: await db.collection.countDocuments(),
// //     });
// //   } catch (error) {
// //     res.status(500).json({
// //       status: "error",
// //       message: error.message,
// //     });
// //   }
// // });

// app.get("/mongodb-status", async (req, res) => {
//   try {
//     // Kiểm tra kết nối
//     if (!db.testConnection) {
//       return res.status(500).json({
//         status: "error",
//         message: "testConnection function not available",
//       });
//     }

//     const isConnected = await db.testConnection();

//     if (!isConnected) {
//       return res.status(500).json({
//         status: "error",
//         message: "Could not connect to MongoDB",
//       });
//     }
//     console.log(db.collection);

//     // Lấy mẫu dữ liệu nếu có
//     // const sampleData = await db.collection.find({}).limit(5).toArray();
//     // const countData = await db.collection.countDocuments();

//     res.status(200).json({
//       status: "success",
//       connected: true,
//       databaseName: process.env.DB_NAME || "custom-order",
//       collectionName: process.env.DB_COLLECTION || "orders_tracking",
//       // recordCount: countData,
//       // sampleData: sampleData,
//     });
//   } catch (error) {
//     res.status(500).json({
//       status: "error",
//       message: error.message,
//     });
//   }
// });

// server.listen(PORT, async () => {
//   console.log(`Server is running on port ${PORT}`);

//   try {
//     // Kết nối đến MongoDB khi khởi động
//     const connected = await db.connectToDatabase();
//     if (connected) {
//       console.log("MongoDB connected successfully!");
//     } else {
//       console.error("Failed to connect to MongoDB");
//     }

//     console.log("Application initialized successfully!");
//   } catch (error) {
//     console.error("Error initializing application:", error.message);
//   }
// });

// process.on("SIGINT", async () => {
//   console.log("Shutting down...");
//   await db.closeConnection();
//   process.exit(0);
// });

// src/index.js
require("dotenv").config();
const express = require("express");
const kiotviet = require("./kiotviet");
const lark = require("./lark");
const scheduler = require("./scheduler");
const db = require("../db-mongo.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("KiotViet-Lark Integration Server is running!");
});

app.get("/test-simple-message", async (req, res) => {
  try {
    await lark.sendTestMessage();
    res.status(200).json({ message: "Test message sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/run-report", async (req, res) => {
  try {
    await scheduler.runReportNow();
    res.status(200).json({ message: "Report triggered successfully" });
  } catch (error) {
    console.error("Error triggering report:", error.message);
    res.status(500).json({ error: "Failed to trigger report" });
  }
});

app.get("/check-status", (req, res) => {
  try {
    let lastOrders = [];
    let fileExists = false;

    if (fs.existsSync("./lastOrders.json")) {
      fileExists = true;
      const data = fs.readFileSync("./lastOrders.json", "utf8");
      if (data && data.trim() !== "") {
        lastOrders = JSON.parse(data);
      }
    }

    res.status(200).json({
      status: "OK",
      storagePath: process.cwd(),
      lastDataFileExists: fileExists,
      lastOrdersCount: lastOrders.length,
      lastDataUpdated: fileExists
        ? fs.statSync("./lastOrders.json").mtime
        : null,
      currentTime: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      error: error.message,
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    await db.connectToDatabase();

    scheduler.setupPeriodicCheck();

    console.log("Application initialized successfully!");
  } catch (error) {
    console.error("Error initializing application:", error.message);
  }
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await db.closeConnection();
  process.exit(0);
});
