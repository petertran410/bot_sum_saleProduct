// src/invoiceScanner.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const kiotviet = require("./kiotviet");
const lark = require("./lark");

// Định nghĩa đường dẫn file để lưu hóa đơn
const INVOICES_FILE_PATH = path.resolve(process.cwd(), "lastInvoices.json");
// Định nghĩa đường dẫn file để lưu ID hóa đơn đã gửi thông báo
const SENT_INVOICES_FILE_PATH = path.resolve(
  process.cwd(),
  "sentInvoices.json"
);

async function setupInvoiceScanner() {
  console.log("Setting up periodic scanner for invoices every 15 seconds");

  const interval = setInterval(async () => {
    try {
      console.log(
        `\n--- Scanning invoices at ${new Date().toLocaleTimeString()} ---`
      );

      // Lấy danh sách hóa đơn hiện tại
      const currentInvoices = await getRecentInvoices();
      console.log(`Retrieved ${currentInvoices.length} invoices from KiotViet`);

      // Lấy danh sách ID hóa đơn đã gửi thông báo
      const sentInvoicesData = getSentInvoicesData();

      // Xác định các hóa đơn mới cần gửi thông báo
      const newInvoices = filterNewInvoices(currentInvoices, sentInvoicesData);

      if (newInvoices.length > 0) {
        console.log(
          `Found ${newInvoices.length} new invoices to send notifications`
        );

        // Gửi thông báo cho các hóa đơn mới
        for (const invoice of newInvoices) {
          try {
            await lark.sendSingleInvoiceReport({
              ...invoice,
              changeType: "info",
            });
            console.log(
              `Successfully sent notification for invoice ${invoice.code}`
            );

            // Thêm ID hóa đơn vào danh sách đã gửi
            sentInvoicesData.invoiceIds.push({
              id: invoice.id,
              code: invoice.code,
              sentAt: new Date().toISOString(),
            });
          } catch (err) {
            console.error(
              `Error sending notification for invoice ${invoice.code}:`,
              err.message
            );
          }
        }

        // Lưu danh sách ID hóa đơn đã gửi
        saveSentInvoicesData(sentInvoicesData);
      } else {
        console.log("No new invoices to send notifications");
      }

      // Lưu danh sách hóa đơn hiện tại vào file
      saveCurrentInvoices(currentInvoices);
    } catch (error) {
      console.error("Error in invoice scanner:", error.message);
    }
  }, 15000); // Chạy mỗi 15 giây

  return {
    stop: () => clearInterval(interval),
  };
}

// Hàm lọc các hóa đơn mới chưa gửi thông báo
function filterNewInvoices(currentInvoices, sentInvoicesData) {
  if (
    !sentInvoicesData ||
    !sentInvoicesData.invoiceIds ||
    !Array.isArray(sentInvoicesData.invoiceIds)
  ) {
    return currentInvoices;
  }

  const sentInvoiceIdSet = new Set(
    sentInvoicesData.invoiceIds.map((item) => item.id)
  );

  return currentInvoices.filter((invoice) => !sentInvoiceIdSet.has(invoice.id));
}

// Hàm lấy dữ liệu về các hóa đơn đã gửi thông báo
function getSentInvoicesData() {
  try {
    if (fs.existsSync(SENT_INVOICES_FILE_PATH)) {
      const data = fs.readFileSync(SENT_INVOICES_FILE_PATH, "utf8");
      if (!data || data.trim() === "") {
        return { invoiceIds: [] };
      }

      try {
        const parsedData = JSON.parse(data);

        if (!parsedData.invoiceIds || !Array.isArray(parsedData.invoiceIds)) {
          return { invoiceIds: [] };
        }

        // Dọn dẹp danh sách, chỉ giữ lại các ID trong 30 ngày gần đây để tránh file quá lớn
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        parsedData.invoiceIds = parsedData.invoiceIds.filter((item) => {
          if (!item.sentAt) return true;
          return new Date(item.sentAt) >= thirtyDaysAgo;
        });

        console.log(
          `Loaded ${parsedData.invoiceIds.length} sent invoice IDs from file`
        );
        return parsedData;
      } catch (parseError) {
        console.error("Error parsing sent invoices data:", parseError.message);
        return { invoiceIds: [] };
      }
    }
    console.log("No existing sent invoices data file, creating new one");
    return { invoiceIds: [] };
  } catch (error) {
    console.error("Error reading sent invoices data:", error.message);
    return { invoiceIds: [] };
  }
}

// Hàm lưu dữ liệu về các hóa đơn đã gửi thông báo
function saveSentInvoicesData(data) {
  try {
    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(SENT_INVOICES_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Ghi file
    fs.writeFileSync(
      SENT_INVOICES_FILE_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    console.log(
      `Successfully saved sent invoices data with ${data.invoiceIds.length} items`
    );
  } catch (error) {
    console.error("Error saving sent invoices data:", error.message);
  }
}

async function getRecentInvoices() {
  try {
    const token = await kiotviet.getToken();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate());
    const fromDateStr = sevenDaysAgo.toISOString().split("T")[0]; // Định dạng YYYY-MM-DD

    console.log(`Fetching invoices from ${fromDateStr} to now`);

    let allInvoices = [];
    let currentItem = 0;
    let hasMoreData = true;
    const pageSize = 100;

    // Lặp để lấy tất cả các trang dữ liệu
    while (hasMoreData) {
      const response = await axios.get(
        `${process.env.KIOT_BASE_URL}/invoices`,
        {
          params: {
            lastModifiedFrom: fromDateStr,
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "modifiedDate",
            orderDirection: "DESC",
            includePayment: true,
            includeInvoiceDelivery: true,
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const invoices = response.data.data || [];
      allInvoices = allInvoices.concat(invoices);

      console.log(
        `Retrieved ${invoices.length} invoices, total so far: ${allInvoices.length}`
      );

      // Kiểm tra xem còn dữ liệu tiếp theo không
      if (invoices.length < pageSize) {
        hasMoreData = false;
      } else {
        currentItem += pageSize;
      }

      // Tránh gọi API quá nhanh
      if (hasMoreData) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`Completed fetching all invoices: ${allInvoices.length} total`);
    return allInvoices;
  } catch (error) {
    console.error("Error getting recent invoices:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response data:",
        JSON.stringify(error.response.data).substring(0, 200) + "..."
      );
    }
    throw error;
  }
}

function saveCurrentInvoices(invoices) {
  try {
    // Kiểm tra nếu invoices là null hoặc undefined
    if (!invoices) {
      console.error("Cannot save null or undefined invoices data");
      return;
    }

    // Kiểm tra nếu invoices không phải là một mảng
    if (!Array.isArray(invoices)) {
      console.error("Invoices data is not an array, cannot save");
      return;
    }

    // Log thông tin chi tiết
    console.log(`Saving ${invoices.length} invoices to ${INVOICES_FILE_PATH}`);

    // Đảm bảo thư mục tồn tại
    const dirPath = path.dirname(INVOICES_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Thêm timestamp khi lưu
    const dataToSave = {
      timestamp: new Date().toISOString(),
      invoices: invoices,
    };

    // Ghi file
    fs.writeFileSync(
      INVOICES_FILE_PATH,
      JSON.stringify(dataToSave, null, 2),
      "utf8"
    );

    console.log(`Successfully saved ${invoices.length} invoices data`);
  } catch (error) {
    console.error("Error saving current invoices data:", error.message);
    console.error("Error stack:", error.stack);
  }
}

module.exports = {
  setupInvoiceScanner,
  getRecentInvoices,
};
