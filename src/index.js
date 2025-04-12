require("dotenv").config();
const express = require("express");
const lark = require("./lark");
const orderScanner = require("./orderScanner.js");
const invoiceScanner = require("./invoiceScanner");
const db = require("../db-mongo.js");
const axios = require("axios");
const kiotviet = require("./kiotviet.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

async function checkTokenMiddleware(req, res, next) {
  try {
    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        error: "Thiếu token xác thực",
        message: "Vui lòng cung cấp token trong header Authorization",
      });
    }

    // Loại bỏ tiền tố "Bearer " nếu có
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    // Kiểm tra token Lark
    const larkToken = await lark.getLarkToken();

    // Kiểm tra token KiotViet
    const kiotvietToken = await kiotviet.getToken();

    // Nếu cả hai token đều hợp lệ
    if (larkToken && kiotvietToken) {
      // Lưu token vào request để sử dụng sau này nếu cần
      req.larkToken = larkToken;
      req.kiotvietToken = kiotvietToken;
      next();
    } else {
      return res.status(401).json({
        error: "Xác thực token thất bại",
        details: {
          larkToken: larkToken ? "Hợp lệ" : "Không hợp lệ",
          kiotvietToken: kiotvietToken ? "Hợp lệ" : "Không hợp lệ",
        },
      });
    }
  } catch (error) {
    console.error("Lỗi xác thực token:", error);
    return res.status(500).json({
      error: "Lỗi nội bộ trong quá trình xác thực",
      message: error.message,
    });
  }
}

app.get("/", (req, res) => {
  res.send("KiotViet-Lark Integration Server is running!");
});

app.get("/test-orders", checkTokenMiddleware, async (req, res) => {
  try {
    const orders = await orderScanner.getRecentOrders();
    res.json({
      total: orders.length,
      kiotvietToken: req.kiotvietToken ? "Đã xác thực" : "Chưa xác thực",
      orders: orders,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      details: error.response ? error.response.data : null,
    });
  }
});

app.get("/get-kiotviet-token", async (req, res) => {
  try {
    const token = await kiotviet.getToken();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/test-saved-orders", (req, res) => {
  try {
    const savedOrders = orderScanner.getSavedOrders();
    res.json(savedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/get-my-open-id", async (req, res) => {
  try {
    const token = await lark.getLarkToken();

    const response = await axios({
      method: "GET",
      url: "https://open.larksuite.com/open-apis/contact/v3/users/me",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });

    console.log("API Response:", JSON.stringify(response.data, null, 2));

    if (response.data && response.data.data) {
      res.json({
        open_id: response.data.data.user_id,
        message:
          "This is your open_id. Add it to your .env file as LARK_USER_ID.",
      });
    } else {
      res
        .status(500)
        .json({ error: "Could not retrieve open_id from response" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  try {
    // await db.connectToDatabase();
    // orderScanner.setupOrderScanner();
    // invoiceScanner.setupInvoiceScanner();
  } catch (error) {
    console.error("Error initializing application:", error.message);
  }
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await db.closeConnection();
  process.exit(0);
});
