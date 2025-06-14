const axios = require("axios");

const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;
const TOKEN_URL = process.env.KIOT_TOKEN;

let currentToken = null;
let tokenExpiresAt = null;

let requestCount = 0;
let hourStartTime = Date.now();
const maxRequestsPerHour = 4900;

async function getToken() {
  try {
    if (currentToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
      return currentToken;
    }

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

    // Cache token with expiration (subtract 5 minutes for safety)
    currentToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600;
    tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);

    console.log(`Token cached, expires at: ${tokenExpiresAt.toISOString()}`);
    return currentToken;
  } catch (error) {
    console.error("Error getting KiotViet token:", error.message);
    throw error;
  }
}

async function checkRateLimit() {
  const currentTime = Date.now();
  const hourElapsed = currentTime - hourStartTime;

  if (hourElapsed >= 3600000) {
    requestCount = 0;
    hourStartTime = currentTime;
    console.log("Rate limit counter reset");
  }

  if (requestCount >= maxRequestsPerHour) {
    const waitTime = 3600000 - hourElapsed;
    console.log(
      `Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    requestCount = 0;
    hourStartTime = Date.now();
  }
}

async function makeApiRequest(config) {
  await checkRateLimit();
  requestCount++;

  try {
    return await axios(config);
  } catch (error) {
    if (error.response?.status === 401 && currentToken) {
      // Token expired, clear cache and retry
      console.log("Token expired, refreshing...");
      currentToken = null;
      tokenExpiresAt = null;
      const newToken = await getToken();
      config.headers.Authorization = `Bearer ${newToken}`;
      return await axios(config);
    }
    throw error;
  }
}

// ORDERS with pagination
const getOrders = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allOrders = [];
    let currentItem = 0;
    let hasMoreData = true;

    // 🎯 TIME-FILTERED: Get only orders modified in last 48 hours
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2); // 48h buffer for safety
    const fromDateStr = fromDate.toISOString().split("T")[0];

    console.log(`Fetching orders modified since ${fromDateStr}...`);

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/orders`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          lastModifiedFrom: fromDateStr, // 🔥 KEY CHANGE: Time filtering
          orderBy: "modifiedDate", // Sort by modification date
          orderDirection: "DESC",
          includePayment: true,
          includeOrderDelivery: true,
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
        allOrders.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} orders (modified since ${fromDateStr}), total: ${allOrders.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(`✅ Total time-filtered orders fetched: ${allOrders.length}`);
    return { data: allOrders, total: allOrders.length };
  } catch (error) {
    console.error("Error getting time-filtered orders:", error.message);
    throw error;
  }
};

const getOrdersByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allOrdersForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching orders for ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/orders`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
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

        if (
          response.data &&
          response.data.data &&
          response.data.data.length > 0
        ) {
          allOrdersForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} orders, total: ${allOrdersForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allOrdersForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting orders by date:`, error.message);
    throw error;
  }
};

// INVOICES with pagination
const getInvoices = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allInvoices = [];
    let currentItem = 0;
    let hasMoreData = true;

    // 🎯 TIME-FILTERED: Get only invoices modified in last 48 hours
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2); // 48h buffer for safety
    const fromDateStr = fromDate.toISOString().split("T")[0];

    console.log(`Fetching invoices modified since ${fromDateStr}...`);

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/invoices`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          lastModifiedFrom: fromDateStr, // 🔥 KEY CHANGE: Time filtering
          orderBy: "modifiedDate", // Sort by modification date
          orderDirection: "DESC",
          includePayment: true,
          includeInvoiceDelivery: true,
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
        allInvoices.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} invoices (modified since ${fromDateStr}), total: ${allInvoices.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(
      `✅ Total time-filtered invoices fetched: ${allInvoices.length}`
    );
    return { data: allInvoices, total: allInvoices.length };
  } catch (error) {
    console.error("Error getting time-filtered invoices:", error.message);
    throw error;
  }
};

const getInvoicesByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allInvoicesForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching invoices for ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/invoices`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
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

        if (
          response.data &&
          response.data.data &&
          response.data.data.length > 0
        ) {
          allInvoicesForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} invoices, total: ${allInvoicesForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allInvoicesForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting invoices by date:`, error.message);
    throw error;
  }
};

// PRODUCTS with pagination
const getProducts = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allProducts = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current products...");

    // Get only recent products (last 24 hours) for current sync
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/products`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          includeInventory: true,
          includePricebook: true,
          includeQuantity: true,
          includeSerials: true,
          IncludeBatchExpires: true,
          includeWarranties: true,
          orderBy: "modifiedDate",
          orderDirection: "DESC",
          lastModifiedFrom: fromDate,
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
        allProducts.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} products, total: ${allProducts.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allProducts, total: allProducts.length };
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
      const allProductsForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching products modified on/after ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/products`,
          params: {
            lastModifiedFrom: formattedDate,
            pageSize: pageSize,
            currentItem: currentItem,
            includeInventory: true,
            includePricebook: true,
            includeQuantity: true,
            includeSerials: true,
            IncludeBatchExpires: true,
            includeWarranties: true,
            orderBy: "modifiedDate",
            orderDirection: "ASC",
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
          allProductsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} products, total: ${allProductsForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allProductsForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting products by date:`, error.message);
    return results;
  }
};

// CUSTOMERS with pagination
const getCustomers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allCustomers = [];
    let currentItem = 0;
    let hasMoreData = true;

    // 🎯 TIME-FILTERED: Get only customers modified in last 48 hours
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2); // 48h buffer for safety
    const fromDateStr = fromDate.toISOString().split("T")[0];

    console.log(`Fetching customers modified since ${fromDateStr}...`);

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/customers`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          lastModifiedFrom: fromDateStr, // 🔥 KEY CHANGE: Time filtering
          orderBy: "modifiedDate", // Sort by modification date
          orderDirection: "DESC",
          includeRemoveIds: true, // Include deleted customers
          includeTotal: false, // Don't include heavy calculations
          includeCustomerGroup: true, // Include group info
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
        allCustomers.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} customers (modified since ${fromDateStr}), total: ${allCustomers.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(
      `✅ Total time-filtered customers fetched: ${allCustomers.length}`
    );
    return { data: allCustomers, total: allCustomers.length };
  } catch (error) {
    console.error("Error getting time-filtered customers:", error.message);
    throw error;
  }
};

const getCustomersByDate = async (daysAgo, specificDate = null) => {
  try {
    const results = [];

    if (specificDate) {
      // Handle specific date format
      const dateParts = specificDate.split("/");
      const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      console.log(`Targeting specific date: ${formattedDate}`);

      const token = await getToken();
      const allCustomersForDate = [];
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100;

      while (hasMoreData) {
        console.log(
          `Fetching page at offset ${currentItem} for ${formattedDate}`
        );

        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/customers`,
          params: {
            pageSize,
            currentItem,
            orderBy: "id",
            orderDirection: "ASC",
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
          allCustomersForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          console.log(
            `Fetched ${response.data.data.length} customers, total: ${allCustomersForDate.length}`
          );
          hasMoreData = response.data.data.length === pageSize;

          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: 0,
        data: { data: allCustomersForDate },
      });

      return results;
    }

    // Regular date range processing
    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];
      console.log(`Processing date: ${formattedDate}`);

      const token = await getToken();
      const allCustomersForDate = [];
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100;

      while (hasMoreData) {
        console.log(
          `Fetching page at offset ${currentItem} for ${formattedDate}`
        );

        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/customers`,
          params: {
            pageSize,
            currentItem,
            orderBy: "id",
            orderDirection: "ASC",
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
          allCustomersForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          console.log(
            `Fetched ${response.data.data.length} customers, total: ${allCustomersForDate.length}`
          );
          hasMoreData = response.data.data.length === pageSize;

          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      console.log(
        `Found ${allCustomersForDate.length} customers for ${formattedDate}`
      );
      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allCustomersForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return results;
  } catch (error) {
    console.error(`Error getting customers:`, error.message);
    throw error;
  }
};

const getUsers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allUsers = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current users...");

    // Get only recent users (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/users`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "id",
          orderDirection: "DESC",
          lastModifiedFrom: fromDate,
          includeRemoveIds: true,
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
        allUsers.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} users, total: ${allUsers.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allUsers, total: allUsers.length };
  } catch (error) {
    console.error("Error getting users:", error.message);
    throw error;
  }
};

const getUsersByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allUsersForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching users modified on/after ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/users`,
          params: {
            lastModifiedFrom: formattedDate,
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "id",
            orderDirection: "ASC",
            includeRemoveIds: true,
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
          allUsersForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} users, total: ${allUsersForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allUsersForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting users by date:`, error.message);
    return results;
  }
};

const getSurcharges = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allSurcharges = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current surcharges...");

    // Get only recent surcharges (last 24 hours) for current sync
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/surchages`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "modifiedDate",
          orderDirection: "DESC",
          lastModifiedFrom: fromDate,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        allSurcharges.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} surcharges, total: ${allSurcharges.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allSurcharges, total: allSurcharges.length };
  } catch (error) {
    console.error("Error getting surcharges:", error.message);
    throw error;
  }
};

const getSurchargesByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allSurchargesForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching surcharges modified on/after ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/surchages`,
          params: {
            lastModifiedFrom: formattedDate,
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "modifiedDate",
            orderDirection: "ASC",
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        });

        if (
          response.data &&
          response.data.data &&
          Array.isArray(response.data.data)
        ) {
          allSurchargesForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} surcharges, total: ${allSurchargesForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allSurchargesForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting surcharges by date:`, error.message);
    return results;
  }
};

const getCashflow = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allCashflows = [];
    let currentItem = 0;
    let hasMoreData = true;

    // ✅ TIME-FILTERED: Get last 7 days for current sync
    const today = new Date();
    const yesterday = new Date();
    const tomorrow = new Date();

    yesterday.setDate(today.getDate() - 7); // ✅ Yesterday
    tomorrow.setDate(today.getDate() + 1); // ✅ Tomorrow (+1 day from today)

    const startDate = yesterday.toISOString().split("T")[0]; // Yesterday
    const endDate = tomorrow.toISOString().split("T")[0];

    console.log(
      `📅 Fetching current cashflows from ${startDate} to ${endDate}...`
    );

    while (hasMoreData) {
      console.log(
        `📄 Fetching cashflow page starting at item ${currentItem}...`
      );

      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/cashflow`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          startDate: startDate, // ✅ KEY FIX: Add start date
          endDate: endDate, // ✅ KEY FIX: Add end date
          includeAccount: true,
          includeBranch: true,
          includeUser: true,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      console.log(
        `📊 API Response - Total: ${response.data?.total}, Current batch: ${response.data?.data?.length}`
      );

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allCashflows.push(...response.data.data);
        currentItem += response.data.data.length;

        // Check if we have more data based on total count
        hasMoreData =
          response.data.total > allCashflows.length &&
          response.data.data.length === pageSize;

        console.log(
          `✅ Fetched ${response.data.data.length} cashflows, total: ${allCashflows.length}/${response.data.total}`
        );

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }

      // Safety check to prevent infinite loops
      if (currentItem > response.data?.total || currentItem > 50000) {
        console.log("Reached maximum items or total count, stopping...");
        break;
      }
    }

    console.log(`🎉 Total current cashflows fetched: ${allCashflows.length}`);
    return { data: allCashflows, total: allCashflows.length };
  } catch (error) {
    console.error("❌ Error getting current cashflows:", error.message);
    throw error;
  }
};

// ✅ Function 2: getCashflowByDate(daysAgo) - For historical sync
// Purpose: Get historical cashflows based on INITIAL_SCAN_DAYS
const getCashflowByDate = async (daysAgo) => {
  try {
    console.log(
      `🗓️ Starting cashflow historical sync for ${daysAgo} days back...`
    );

    // ✅ Calculate the actual date range from INITIAL_SCAN_DAYS
    const endDate = new Date(); // Today
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - daysAgo); // Go back daysAgo days

    const formattedStartDate = startDate.toISOString().split("T")[0];
    const formattedEndDate = endDate.toISOString().split("T")[0];

    console.log(
      `📅 Fetching cashflows from ${formattedStartDate} to ${formattedEndDate}`
    );
    console.log(`🎯 This covers ${daysAgo + 1} days of historical data`);

    const token = await getToken();
    const pageSize = 100;
    const allCashflows = [];
    let currentItem = 0;
    let hasMoreData = true;

    // ✅ Fetch ALL cashflows in the specified date range
    while (hasMoreData) {
      console.log(
        `📄 Fetching cashflow page starting at item ${currentItem}...`
      );

      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/cashflow`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          startDate: formattedStartDate, // ✅ KEY FIX: Use calculated start date
          endDate: formattedEndDate, // ✅ KEY FIX: Use calculated end date
          includeAccount: true,
          includeBranch: true,
          includeUser: true,
        },
        headers: {
          Retailer: process.env.KIOT_SHOP_NAME,
          Authorization: `Bearer ${token}`,
        },
      });

      console.log(
        `📊 API Response - Total available: ${response.data?.total}, Current batch: ${response.data?.data?.length}`
      );

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allCashflows.push(...response.data.data);
        currentItem += response.data.data.length;

        // Check if we have more data based on total count
        hasMoreData =
          response.data.total > allCashflows.length &&
          response.data.data.length === pageSize;

        console.log(
          `✅ Fetched ${response.data.data.length} cashflows, total collected: ${allCashflows.length}/${response.data.total}`
        );

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        console.log("No more cashflow data received");
        hasMoreData = false;
      }

      // Safety check to prevent infinite loops
      if (currentItem > response.data?.total || currentItem > 100000) {
        console.log("Reached maximum items, stopping fetch...");
        break;
      }
    }

    console.log(`🎉 Total cashflows fetched from API: ${allCashflows.length}`);

    if (allCashflows.length === 0) {
      console.log(
        "⚠️ No cashflow data found in API for the specified date range"
      );
      return [];
    }

    // ✅ Group by individual dates for processing
    const cashflowsByDate = new Map();

    allCashflows.forEach((cashflow) => {
      if (cashflow.transDate) {
        const transDate = new Date(cashflow.transDate);
        const dateKey = transDate.toISOString().split("T")[0]; // YYYY-MM-DD format

        if (!cashflowsByDate.has(dateKey)) {
          cashflowsByDate.set(dateKey, []);
        }
        cashflowsByDate.get(dateKey).push(cashflow);
      }
    });

    console.log(
      `📊 Cashflows grouped into ${cashflowsByDate.size} different dates`
    );

    // ✅ Create results for each day in the requested range
    const results = [];
    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const cashflowsForDate = cashflowsByDate.get(formattedDate) || [];

      console.log(
        `📅 Date ${formattedDate} (${currentDaysAgo} days ago): Found ${cashflowsForDate.length} cashflows`
      );

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: cashflowsForDate },
      });
    }

    const totalProcessed = results.reduce(
      (sum, r) => sum + r.data.data.length,
      0
    );
    console.log(
      `🎯 Final summary: ${results.length} days processed, ${totalProcessed} total cashflows`
    );

    return results;
  } catch (error) {
    console.error(`❌ Error getting cashflows by date:`, error.message);
    throw error;
  }
};

const getPurchaseOrders = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allPurchaseOrders = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current purchase orders...");

    // Fixed: Use proper date range and parameters
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 7); // Get last 7 days instead of 1
    const fromDate = yesterday.toISOString().split("T")[0];
    const toDate = today.toISOString().split("T")[0];

    while (hasMoreData) {
      try {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/purchaseorders`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            // Fixed: Remove problematic parameters that cause 400 errors
            fromPurchaseDate: fromDate,
            toPurchaseDate: toDate,
            // Removed: orderBy, orderDirection, includePayment as they may cause 400 errors
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        });

        if (
          response.data &&
          response.data.data &&
          Array.isArray(response.data.data)
        ) {
          allPurchaseOrders.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Fetched ${response.data.data.length} purchase orders, total: ${allPurchaseOrders.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      } catch (error) {
        console.error(
          `Error in purchase orders pagination at item ${currentItem}:`,
          error.message
        );
        // If we get data but have an error on subsequent pages, return what we have
        if (allPurchaseOrders.length > 0) {
          console.log(
            `Returning ${allPurchaseOrders.length} purchase orders despite pagination error`
          );
          break;
        }
        throw error;
      }
    }

    return { data: allPurchaseOrders, total: allPurchaseOrders.length };
  } catch (error) {
    console.error("Error getting purchase orders:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    throw error;
  }
};

// Fix for Purchase Orders by Date
const getPurchaseOrdersByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allPurchaseOrdersForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching purchase orders for ${formattedDate}...`);

      while (hasMoreData) {
        try {
          const response = await makeApiRequest({
            method: "GET",
            url: `${KIOTVIET_BASE_URL}/purchaseorders`,
            params: {
              pageSize: pageSize,
              currentItem: currentItem,
              // Fixed: Simplified parameters to avoid 400 errors
              fromPurchaseDate: formattedDate,
              toPurchaseDate: formattedDate,
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
            allPurchaseOrdersForDate.push(...response.data.data);
            currentItem += response.data.data.length;
            hasMoreData = response.data.data.length === pageSize;

            console.log(
              `Date ${formattedDate}: Fetched ${response.data.data.length} purchase orders, total: ${allPurchaseOrdersForDate.length}`
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            hasMoreData = false;
          }
        } catch (error) {
          console.error(
            `Error fetching purchase orders for ${formattedDate}:`,
            error.message
          );
          if (error.response?.status === 400) {
            console.log(`Skipping date ${formattedDate} due to 400 error`);
            break; // Skip this date and continue with next
          }
          throw error;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allPurchaseOrdersForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting purchase orders by date:`, error.message);
    throw error;
  }
};

const getTransfers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100; // Use 100 like in the working purchase orders
    const allTransfers = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current transfers...");

    while (hasMoreData) {
      try {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/transfers`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            // REMOVED: Date filtering that's causing 0 results
            // fromTransferDate: fromDate,
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
          allTransfers.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Fetched ${response.data.data.length} transfers, total: ${allTransfers.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      } catch (error) {
        console.error("Error in transfer pagination:", error.message);
        if (allTransfers.length > 0) {
          console.log(
            `Returning ${allTransfers.length} transfers despite pagination error`
          );
          break;
        }
        throw error;
      }
    }

    console.log(`✅ Total transfers fetched: ${allTransfers.length}`);
    return { data: allTransfers, total: allTransfers.length };
  } catch (error) {
    console.error("Error getting transfers:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    throw error;
  }
};

// Fix 2: Historical transfers - Use broader date ranges, not day-by-day
const getTransfersByDate = async (daysAgo) => {
  try {
    const results = [];
    const CHUNK_SIZE = 30; // Process 30 days at a time instead of day-by-day

    for (
      let startDaysAgo = daysAgo;
      startDaysAgo >= 0;
      startDaysAgo -= CHUNK_SIZE
    ) {
      const endDaysAgo = Math.max(0, startDaysAgo - CHUNK_SIZE + 1);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - startDaysAgo);
      const formattedStartDate = startDate.toISOString().split("T")[0];

      const endDate = new Date();
      endDate.setDate(endDate.getDate() - endDaysAgo);
      const formattedEndDate = endDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allTransfersForPeriod = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(
        `Fetching transfers from ${formattedStartDate} to ${formattedEndDate}...`
      );

      while (hasMoreData) {
        try {
          const response = await makeApiRequest({
            method: "GET",
            url: `${KIOTVIET_BASE_URL}/transfers`,
            params: {
              pageSize: pageSize,
              currentItem: currentItem,
              fromTransferDate: formattedStartDate,
              toTransferDate: formattedEndDate,
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
            allTransfersForPeriod.push(...response.data.data);
            currentItem += response.data.data.length;
            hasMoreData = response.data.data.length === pageSize;

            console.log(
              `Period ${formattedStartDate} to ${formattedEndDate}: Fetched ${response.data.data.length} transfers, total: ${allTransfersForPeriod.length}`
            );
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            hasMoreData = false;
          }
        } catch (error) {
          console.error(
            `Error fetching transfers for period ${formattedStartDate} to ${formattedEndDate}:`,
            error.message
          );
          break; // Skip this period on error
        }
      }

      // Distribute transfers by actual date for compatibility with scheduler
      const transfersByDate = new Map();

      allTransfersForPeriod.forEach((transfer) => {
        // Use dispatchedDate as primary, fallback to other date fields
        const transferDate =
          transfer.dispatchedDate ||
          transfer.transferredDate ||
          transfer.createdDate;
        if (transferDate) {
          const dateKey = transferDate.split("T")[0]; // YYYY-MM-DD format
          if (!transfersByDate.has(dateKey)) {
            transfersByDate.set(dateKey, []);
          }
          transfersByDate.get(dateKey).push(transfer);
        }
      });

      // Add results for each day in this period
      for (let dayOffset = startDaysAgo; dayOffset >= endDaysAgo; dayOffset--) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - dayOffset);
        const formattedDate = targetDate.toISOString().split("T")[0];

        const transfersForDate = transfersByDate.get(formattedDate) || [];

        results.push({
          date: formattedDate,
          daysAgo: dayOffset,
          data: { data: transfersForDate },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const totalTransfers = results.reduce(
      (sum, result) => sum + result.data.data.length,
      0
    );
    console.log(
      `✅ Historical transfer fetch completed: ${totalTransfers} transfers across ${results.length} days`
    );

    return results;
  } catch (error) {
    console.error(`Error getting transfers by date:`, error.message);
    throw error;
  }
};

const getSaleChannels = async () => {
  try {
    const token = await getToken(); // Get authentication token first

    const response = await makeApiRequest({
      // Change from makeRequest to makeApiRequest
      method: "GET",
      url: `${KIOTVIET_BASE_URL}/salechannel`,
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(`✅ Total sale channels fetched: ${response.data.total}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting sale channels:`, error.message);
    throw error;
  }
};

async function getReturns() {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allReturns = [];
    let currentItem = 0;
    let hasMoreData = true;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/returns`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          includePayment: true,
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
        allReturns.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} returns, total" ${allReturns.length}`
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allReturns, total: allReturns.length };
  } catch (error) {
    console.error("❌ Error fetching returns from KiotViet:", error.message);
    throw error;
  }
}

async function getReturnsByDate(daysAgo) {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];
      const token = await getToken();
      const pageSize = 100;
      const allReturnsForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/returns`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            includePayment: true,
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
          allReturnsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        data: formattedDate,
        daysAgo,
        currentDaysAgo,
        data: { data: allReturnsForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error("❌ Error in getReturnsByDate:", error.message);
    throw error;
  }
}

const getOrderSuppliers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allOrderSuppliers = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current order suppliers...");

    while (hasMoreData) {
      try {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/ordersuppliers`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
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
          allOrderSuppliers.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Fetched ${response.data.data.length} order suppliers, total: ${allOrderSuppliers.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      } catch (error) {
        if (error.response?.status === 400 && allOrderSuppliers.length > 0) {
          console.log(
            `Returning ${allOrderSuppliers.length} order suppliers despite pagination error`
          );
          break;
        }
        throw error;
      }
    }

    return { data: allOrderSuppliers, total: allOrderSuppliers.length };
  } catch (error) {
    console.error("Error getting order suppliers:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    throw error;
  }
};

const getOrderSuppliersByDate = async (daysAgo) => {
  console.log(
    `⚠️  OrderSuppliers API doesn't support date filtering. Fetching all order suppliers instead.`
  );

  const allOrderSuppliers = await getOrderSuppliers();

  // Return in the expected format for compatibility
  return [
    {
      date: new Date().toISOString().split("T")[0],
      daysAgo: 0,
      data: allOrderSuppliers,
    },
  ];
};

const getLocations = async () => {
  try {
    const token = await getToken();
    const pageSize = 100; // Maximum allowed by KiotViet API
    const allLocations = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching all locations with pagination...");

    while (hasMoreData) {
      try {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/locations`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
          },
          headers: {
            Retailer: process.env.KIOT_SHOP_NAME,
            Authorization: `Bearer ${token}`,
          },
        });

        console.log("API Response Debug:", {
          total: response.data?.total,
          pageSize: response.data?.pageSize,
          dataLength: response.data?.data?.length,
          currentItem: currentItem,
        });

        if (
          response.data &&
          response.data.data &&
          Array.isArray(response.data.data) &&
          response.data.data.length > 0
        ) {
          // Add locations from this page
          allLocations.push(...response.data.data);

          // Update pagination tracker
          currentItem += response.data.data.length;

          // Determine if more data exists
          hasMoreData = response.data.data.length === pageSize;

          // Additional check: if we have total count, use it
          if (
            response.data.total &&
            allLocations.length >= response.data.total
          ) {
            hasMoreData = false;
          }

          console.log(
            `✅ Fetched ${response.data.data.length} locations | Total: ${
              allLocations.length
            }/${response.data.total || "unknown"}`
          );

          // Rate limiting - prevent API throttling
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          console.log("No more location data available");
          hasMoreData = false;
        }

        // Safety check to prevent infinite loops
        if (currentItem > 10000) {
          console.log("⚠️ Safety limit reached, stopping pagination");
          break;
        }
      } catch (error) {
        console.error(
          `Pagination error at currentItem ${currentItem}:`,
          error.message
        );

        // If we already have some data, return what we got
        if (allLocations.length > 0) {
          console.log(
            `Returning ${allLocations.length} locations despite pagination error`
          );
          break;
        }
        throw error;
      }
    }

    console.log(`🎉 Successfully synced ${allLocations.length} locations`);

    // Return data in the same format as your current function
    return {
      data: allLocations,
      total: allLocations.length,
    };
  } catch (error) {
    console.error("❌ Error getting locations:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw error;
  }
};

const getTrademarks = async () => {
  try {
    const token = await getToken();
    const pageSize = 100; // Maximum allowed by API
    const allTrademarks = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current trademarks...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/trademark`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "name",
          orderDirection: "ASC",
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
        allTrademarks.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} trademarks, total: ${allTrademarks.length}`
        );

        // Add small delay to respect API rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(`✅ Total trademarks fetched: ${allTrademarks.length}`);
    return { data: allTrademarks };
  } catch (error) {
    console.error("Error getting trademarks:", error.message);
    throw error;
  }
};

const getAttributes = async () => {
  try {
    console.log("Fetching product attributes...");
    const token = await getToken();

    const response = await makeApiRequest({
      method: "GET",
      url: `${KIOTVIET_BASE_URL}/attributes/allwithdistinctvalue`,
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data && Array.isArray(response.data)) {
      console.log(`Fetched ${response.data.length} attributes`);
      return { data: response.data, total: response.data.length };
    } else {
      console.log("No attributes data received");
      return { data: [], total: 0 };
    }
  } catch (error) {
    console.error("Error getting attributes:", error.message);
    throw error;
  }
};

const getProductOnHands = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allProductOnHands = [];
    let currentItem = 0;
    let hasMoreData = true;

    // 🎯 TIME-FILTERED: Get only productOnHands modified in last 48 hours
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 2); // 48h buffer for safety
    const fromDateStr = fromDate.toISOString().split("T")[0];

    console.log(`Fetching productOnHands modified since ${fromDateStr}...`);

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/productOnHands`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          lastModifiedFrom: fromDateStr, // 🔥 KEY: Time filtering
          orderBy: "code", // Sort by product code
          orderDirection: "ASC",
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
        allProductOnHands.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} productOnHands (modified since ${fromDateStr}), total: ${allProductOnHands.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(
      `✅ Total time-filtered productOnHands fetched: ${allProductOnHands.length}`
    );
    return { data: allProductOnHands, total: allProductOnHands.length };
  } catch (error) {
    console.error("Error getting time-filtered productOnHands:", error.message);
    throw error;
  }
};

// HISTORICAL ProductOnHands sync (for initial full sync)
const getProductOnHandsByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let i = 0; i <= daysAgo; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const dateStr = targetDate.toISOString().split("T")[0];

      console.log(`Fetching productOnHands for date: ${dateStr}`);

      const token = await getToken();
      const allProductOnHandsForDate = [];
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100;

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/productOnHands`,
          params: {
            pageSize,
            currentItem,
            lastModifiedFrom: dateStr,
            orderBy: "code",
            orderDirection: "ASC",
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
          allProductOnHandsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;
        } else {
          hasMoreData = false;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (allProductOnHandsForDate.length > 0) {
        results.push({
          date: dateStr,
          data: { data: allProductOnHandsForDate },
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Error getting productOnHands by date:", error.message);
    throw error;
  }
};

const getBranches = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allBranches = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log(`Fetching all current branches...`);

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/branches`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "id", // Sort by ID for consistent pagination
          orderDirection: "ASC",
          // ✅ REMOVED lastModifiedFrom to get ALL branches
          // includeRemoveIds: true, // Only needed if using time filtering
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
        allBranches.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} branches, total: ${allBranches.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    console.log(`✅ Total branches fetched: ${allBranches.length}`);
    return {
      data: allBranches,
      total: allBranches.length,
    };
  } catch (error) {
    console.error("Error getting branches:", error.message);
    throw error;
  }
};

// HISTORICAL Branches sync - SIMPLIFIED to get all branches once
const getBranchesByDate = async (daysAgo) => {
  try {
    console.log(
      `🔄 Getting all branches for historical sync (branches are relatively static)...`
    );

    // ✅ FIXED: Just get all branches in one go since branches don't change often
    const allBranchesData = await getBranches();

    if (
      allBranchesData &&
      allBranchesData.data &&
      allBranchesData.data.length > 0
    ) {
      console.log(
        `✅ Historical branches sync: Found ${allBranchesData.data.length} branches total`
      );

      return [
        {
          date: new Date().toISOString().split("T")[0],
          data: {
            data: allBranchesData.data,
            total: allBranchesData.data.length,
          },
        },
      ];
    }

    console.log("No branches found");
    return [];
  } catch (error) {
    console.error("Error getting historical branches:", error.message);
    throw error;
  }
};

const getPricebooks = async () => {
  try {
    const token = await getToken();
    const pageSize = 100; // Maximum allowed by API
    const allPricebooks = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching all pricebooks...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/pricebooks`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          // NO lastModifiedFrom - pure full sync like trademarks
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
        allPricebooks.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} pricebooks, total: ${allPricebooks.length}`
        );

        // Add small delay to respect API rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }

      // Safety check to prevent infinite loops
      if (currentItem > 10000) {
        console.log("⚠️ Safety limit reached, stopping pagination");
        break;
      }
    }

    console.log(`🎉 Successfully synced ${allPricebooks.length} pricebooks`);
    return { data: allPricebooks, total: allPricebooks.length };
  } catch (error) {
    console.error("❌ Error getting pricebooks:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
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
  getUsers,
  getUsersByDate,
  getSurcharges,
  getSurchargesByDate,
  getCashflow,
  getCashflowByDate,
  getPurchaseOrders,
  getPurchaseOrdersByDate,
  getTransfers,
  getTransfersByDate,
  getSaleChannels,
  getReturns,
  getReturnsByDate,
  getOrderSuppliers,
  getOrderSuppliersByDate,
  getLocations,
  getTrademarks,
  getAttributes,
  getProductOnHands,
  getProductOnHandsByDate,
  getBranches,
  getBranchesByDate,
  getPricebooks,
};
