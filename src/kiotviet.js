const axios = require("axios");

const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;
const TOKEN_URL = process.env.KIOT_TOKEN;

// Token caching
let currentToken = null;
let tokenExpiresAt = null;

// Rate limiting
let requestCount = 0;
let hourStartTime = Date.now();
const maxRequestsPerHour = 4900;

async function getToken() {
  try {
    // Check if token is still valid
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

    console.log("Fetching current orders...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/orders`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
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

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allOrders.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} orders, total: ${allOrders.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allOrders, total: allOrders.length };
  } catch (error) {
    console.error("Error getting orders:", error.message);
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

    console.log("Fetching current invoices...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/invoices`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
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

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allInvoices.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} invoices, total: ${allInvoices.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allInvoices, total: allInvoices.length };
  } catch (error) {
    console.error("Error getting invoices:", error.message);
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

    console.log("Fetching current customers...");

    // Get only recent customers (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const fromDate = yesterday.toISOString().split("T")[0];

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/customers`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allCustomers.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} customers, total: ${allCustomers.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allCustomers, total: allCustomers.length };
  } catch (error) {
    console.error("Error fetching customers:", error.message);
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

    console.log("Fetching current cashflows...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/cashflow`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          includeAccount: true,
          includeBranch: true,
          includeUser: true,
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
        allCashflows.push(...response.data.data);
        currentItem += response.data.data.length;

        // Check if we have more data based on total count
        hasMoreData =
          response.data.total > allCashflows.length &&
          response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} cashflows, total: ${allCashflows.length}/${response.data.total}`
        );
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

    console.log(`Total cashflows fetched: ${allCashflows.length}`);
    return { data: allCashflows, total: allCashflows.length };
  } catch (error) {
    console.error("Error getting cashflows:", error.message);
    throw error;
  }
};

const getCashflowByDate = async (daysAgo) => {
  try {
    const results = [];

    console.log("Attempting to fetch all cashflow data...");

    const token = await getToken();
    const pageSize = 100;
    const allCashflows = [];
    let currentItem = 0;
    let hasMoreData = true;
    let totalFetched = 0;

    while (hasMoreData) {
      console.log(`Fetching cashflow page starting at item ${currentItem}...`);

      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/cashflow`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
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
        `API Response - Total: ${response.data?.total}, Current batch: ${response.data?.data?.length}`
      );

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        allCashflows.push(...response.data.data);
        currentItem += response.data.data.length;
        totalFetched += response.data.data.length;

        // Check if we have more data
        hasMoreData =
          response.data.total > allCashflows.length &&
          response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} cashflows, total collected: ${allCashflows.length}/${response.data.total}`
        );

        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        console.log("No more cashflow data received");
        hasMoreData = false;
      }

      // Safety check to prevent infinite loops
      if (currentItem > response.data?.total || totalFetched > 50000) {
        console.log("Reached maximum items, stopping fetch...");
        break;
      }
    }

    console.log(`Total cashflows fetched from API: ${allCashflows.length}`);

    if (allCashflows.length === 0) {
      console.log("No cashflow data found in API");
      return [];
    }

    // Now group by date in memory
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
      `Cashflows grouped into ${cashflowsByDate.size} different dates`
    );

    // Create results for the requested date range
    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const cashflowsForDate = cashflowsByDate.get(formattedDate) || [];

      console.log(
        `Date ${formattedDate}: Found ${cashflowsForDate.length} cashflows`
      );

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: cashflowsForDate },
      });
    }

    return results;
  } catch (error) {
    console.error(`Error getting cashflows by date:`, error.message);
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
    const response = await makeRequest("/salechannel", {
      pageSize: 100,
      orderBy: "name",
      orderDirection: "Asc",
    });

    console.log(`✅ Total sale channels fetched: ${response.data.total}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting sale channels:`, error.message);
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
};
