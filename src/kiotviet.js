const axios = require("axios");

const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;
const TOKEN_URL = process.env.KIOT_TOKEN;

async function getToken() {
  try {
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.KIOT_CLIEND_ID,
        client_secret: process.env.KIOT_SECRET_KEY,
        grant_type: "client_credentials",
        scopes: "PublicApi.Access",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error("Lỗi khi lấy KiotViet token:", error.message);
    throw error;
  }
}
const getOrders = async () => {
  try {
    const token = await getToken();
    const pageSize = 200;

    const response = await axios.get(`${KIOTVIET_BASE_URL}/orders?{}`, {
      params: {
        pageSize: pageSize,
        orderBy: "createdDate",
        orderDirection: "DESC",
        includePayment: true,
        includeOrderDelivery: true,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.log(error);
  }
};

const getOrdersByDate = async (daysAgo) => {
  try {
    const results = [];
    let currentDaysAgo = daysAgo;

    for (currentDaysAgo >= 0; currentDaysAgo--; ) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);

      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 200;

      const response = await axios.get(`${KIOTVIET_BASE_URL}/orders?{}`, {
        params: {
          pageSize: pageSize,
          orderBy: "createdDate",
          orderDirection: "DESC",
          createdDate: formattedDate,
          includePayment: true,
          includeOrderDelivery: true,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: response.data,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(
      `Error getting orders for ${daysAgo} days ago:`,
      error.message
    );
    throw error;
  }
};

const getInvoices = async () => {
  try {
    const token = await getToken();
    const pageSize = 200;

    const response = await axios.get(`${KIOTVIET_BASE_URL}/invoices?{}`, {
      params: {
        pageSize: pageSize,
        orderBy: "createdDate",
        orderDirection: "DESC",
        includePayment: true,
        includeInvoiceDelivery: true,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.log(error);
  }
};

const getInvoicesByDate = async (daysAgo) => {
  try {
    const results = [];
    let currentDaysAgo = daysAgo;

    for (currentDaysAgo >= 0; currentDaysAgo--; ) {
      const targetDate = new Date();

      targetDate.setDate(targetDate.getDate() - currentDaysAgo);

      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 200;

      const response = await axios.get(`${KIOTVIET_BASE_URL}/invoices?{}`, {
        params: {
          pageSize: pageSize,
          orderBy: "createdDate",
          orderDirection: "DESC",
          createdDate: formattedDate,
          includePayment: true,
          includeInvoiceDelivery: true,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        date: response.data,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.log(
      `Error getting invoices for ${daysAgo} days ago: `,
      error.message
    );
    throw error;
  }
};

const getProducts = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;

    const response = await axios.get(`${KIOTVIET_BASE_URL}/products`, {
      params: {
        pageSize: pageSize,
        includeInventory: true,
        includePricebook: true,
        includeQuantity: true,
        includeSerials: true,
        IncludeBatchExpires: true,
        includeWarranties: true,
        orderBy: "name",
        createdDate: "2025-01-01",
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error getting products:", error.message);
    throw error;
  }
};

const getProductsByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();

      targetDate.setDate(targetDate.getDate() - currentDaysAgo);

      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;

      const response = await axios.get(`${KIOTVIET_BASE_URL}/products`, {
        params: {
          lastModifiedFrom: formattedDate,
          pageSize: pageSize,
          includeInventory: true,
          includePricebook: true,
          includeQuantity: true,
          includeSerials: true,
          IncludeBatchExpires: true,
          includeWarranties: true,
          orderBy: "name",
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: response.data,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(
      `Error getting products for ${daysAgo} days ago:`,
      error.message
    );
    return { data: [] };
  }
};

// In kiotviet.js
const getCustomers = async () => {
  try {
    const token = await getToken();
    const pageSize = 200;

    // Get only recent data - last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    const response = await axios.get(`${KIOTVIET_BASE_URL}/customers`, {
      params: {
        pageSize: pageSize,
        orderBy: "createdDate",
        orderDirection: "DESC",
        // Add this to only get recent customers like your other syncs
        lastModifiedFrom: fromDate,
        includeTotal: true,
        includeCustomerGroup: true,
        includeCustomerSocial: true,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error fetching customers:", error.message);
    throw error;
  }
};

// Same pagination fix for getCustomersByDate
const getCustomersByDate = async (daysAgo, specificDate = null) => {
  try {
    const results = [];

    // If targeting specific date like 22/12/2024
    if (specificDate) {
      // Format date to API's expected format (YYYY-MM-DD)
      const dateParts = specificDate.split("/");
      const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      console.log(`Targeting specific date: ${formattedDate}`);

      let token = await getToken();
      const allCustomersForDate = { data: [] };
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100; // Smaller page size for stability

      while (hasMoreData) {
        console.log(
          `Fetching page at offset ${currentItem} for ${formattedDate}`
        );
        try {
          const response = await axios.get(`${KIOTVIET_BASE_URL}/customers`, {
            params: {
              pageSize,
              currentItem,
              orderBy: "id", // Use id for consistent pagination
              orderDirection: "ASC", // Ascending order to not miss records
              includeTotal: true,
              includeCustomerGroup: true,
              includeCustomerSocial: true,
              createdDate: formattedDate,
            },
            headers: {
              Retailer: process.env.KIOT_SHOP_NAME,
              Authorization: `Bearer ${token}`,
            },
          });

          if (
            response.data &&
            response.data.data &&
            response.data.data.length > 0
          ) {
            allCustomersForDate.data = allCustomersForDate.data.concat(
              response.data.data
            );
            currentItem += response.data.data.length;
            console.log(
              `Fetched ${response.data.data.length} customers, total: ${allCustomersForDate.data.length}`
            );
            hasMoreData = response.data.data.length === pageSize;
          } else {
            hasMoreData = false;
          }

          // Refresh token if needed (every 5000 records)
          if (currentItem % 5000 === 0 && hasMoreData) {
            token = await getToken();
          }

          // Prevent rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (pageError) {
          console.error(
            `Error fetching page at offset ${currentItem}:`,
            pageError.message
          );
          // Try to refresh token and retry once
          if (pageError.response && pageError.response.status === 401) {
            token = await getToken();
            // Continue with next iteration (retry)
            continue;
          }
          // If not an auth error or retry failed, wait longer and try again
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: 0,
        data: {
          data: allCustomersForDate.data,
        },
      });

      return results;
    }

    // Regular behavior for date range
    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];
      console.log(`Processing date: ${formattedDate}`);

      let token = await getToken();

      // For each date, fetch all pages
      const allCustomersForDate = { data: [] };
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100; // Smaller page size for stability

      while (hasMoreData) {
        console.log(
          `Fetching page at offset ${currentItem} for ${formattedDate}`
        );
        try {
          const response = await axios.get(`${KIOTVIET_BASE_URL}/customers`, {
            params: {
              pageSize,
              currentItem,
              orderBy: "id", // Use id for consistent pagination
              orderDirection: "ASC", // Ascending order to not miss records
              includeTotal: true,
              includeCustomerGroup: true,
              includeCustomerSocial: true,
              createdDate: formattedDate,
            },
            headers: {
              Retailer: process.env.KIOT_SHOP_NAME,
              Authorization: `Bearer ${token}`,
            },
          });

          if (
            response.data &&
            response.data.data &&
            response.data.data.length > 0
          ) {
            allCustomersForDate.data = allCustomersForDate.data.concat(
              response.data.data
            );
            currentItem += response.data.data.length;
            console.log(
              `Fetched ${response.data.data.length} customers, total: ${allCustomersForDate.data.length}`
            );
            hasMoreData = response.data.data.length === pageSize;
          } else {
            hasMoreData = false;
          }

          // Refresh token if needed (every 5000 records)
          if (currentItem % 5000 === 0 && hasMoreData) {
            token = await getToken();
          }

          // Prevent rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (pageError) {
          console.error(
            `Error fetching page at offset ${currentItem}:`,
            pageError.message
          );
          // Try to refresh token and retry once
          if (pageError.response && pageError.response.status === 401) {
            token = await getToken();
            // Continue with next iteration (retry)
            continue;
          }
          // If not an auth error or retry failed, wait longer and try again
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }

      console.log(
        `Found ${allCustomersForDate.data.length} customers for ${formattedDate}`
      );
      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: {
          data: allCustomersForDate.data,
        },
      });

      // Allow system to breathe between dates
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return results;
  } catch (error) {
    console.error(`Error getting customers:`, error.message);
    throw error;
  }
};

module.exports = {
  getOrders,
  getOrdersByDate,
  getInvoices,
  getInvoicesByDate,
  getProducts,
  getProductsByDate,
  getCustomers,
  getCustomersByDate,
};
