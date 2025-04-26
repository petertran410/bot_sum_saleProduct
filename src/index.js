require("dotenv").config();
const express = require("express");
const {
  orderScheduler,
  orderSchedulerCurrent,
} = require("../scheduler/orderScheduler");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const checkHistoricalDataStatus = () => {
  const folderName = "saveJson";
  const fileName = "historical_status.json";
  const filePath = path.join(
    path.resolve(__dirname, ".."),
    folderName,
    fileName
  );

  try {
    if (fs.existsSync(filePath)) {
      const status = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return status.completed || false;
    }
    return false;
  } catch (error) {
    return false;
  }
};

const markHistoricalDataCompleted = () => {
  const folderName = "saveJson";
  const fileName = "historical_status.json";
  const filePath = path.join(
    path.resolve(__dirname, ".."),
    folderName,
    fileName
  );

  try {
    if (!fs.existsSync(path.join(path.resolve(__dirname, ".."), folderName))) {
      fs.mkdirSync(path.join(path.resolve(__dirname, ".."), folderName), {
        recursive: true,
      });
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify({ completed: true }, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Không thể đánh dấu trạng thái:", error);
  }
};

const runOrderSync = async () => {
  try {
    const historicalDataCompleted = checkHistoricalDataStatus();

    if (!historicalDataCompleted) {
      const result = await orderScheduler(160);

      if (result.success) {
        markHistoricalDataCompleted();

        console.log("Historical orders data has been saved");
      } else {
        console.error("Error when saving historical data:", result.error);
      }
    } else {
      const currentResult = await orderSchedulerCurrent();

      if (currentResult.success) {
        console.log(
          `Current orders data has been added: ${currentResult.data.length} orders`
        );
      } else {
        console.error("Error when adding current orders:", currentResult.error);
      }
    }
  } catch (error) {
    console.error("Cannot get and save data orders:", error);
  }
};

app.get("/", (req, res) => {
  res.send("Order Synchronization Service is running");
});

app.get("/save-order", async (req, res) => {
  try {
    await runOrderSync();
    res.json({
      success: true,
      message: "Order synchronization completed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during order synchronization",
      error: error.message,
    });
  }
});

const server = app.listen(PORT, async () => {
  await runOrderSync();

  const syncInterval = setInterval(runOrderSync, 60 * 3000);

  process.on("SIGINT", () => {
    clearInterval(syncInterval);
    server.close(() => {
      console.log("Server stopped");
      process.exit(0);
    });
  });
});
