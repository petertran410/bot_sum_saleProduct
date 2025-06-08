// src/kiotviet.js - UPDATED VERSION with missing API endpoints
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

// CATEGORIES with pagination
const getCategories = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allCategories = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current categories...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/categories`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "categoryName",
          orderDirection: "ASC",
          hierachicalData: false,
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
        allCategories.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} categories, total: ${allCategories.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allCategories, total: allCategories.length };
  } catch (error) {
    console.error("Error getting categories:", error.message);
    throw error;
  }
};

// BRANCHES with pagination
const getBranches = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allBranches = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current branches...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/branches`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "branchName",
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

    return { data: allBranches, total: allBranches.length };
  } catch (error) {
    console.error("Error getting branches:", error.message);
    throw error;
  }
};

// SUPPLIERS with pagination
const getSuppliers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allSuppliers = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current suppliers...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/suppliers`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "name",
          orderDirection: "ASC",
          includeTotal: true,
          includeSupplierGroup: true,
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
        allSuppliers.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} suppliers, total: ${allSuppliers.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allSuppliers, total: allSuppliers.length };
  } catch (error) {
    console.error("Error getting suppliers:", error.message);
    throw error;
  }
};

// BANK ACCOUNTS with pagination
const getBankAccounts = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allBankAccounts = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current bank accounts...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/BankAccounts`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "bankName",
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
        allBankAccounts.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} bank accounts, total: ${allBankAccounts.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allBankAccounts, total: allBankAccounts.length };
  } catch (error) {
    console.error("Error getting bank accounts:", error.message);
    throw error;
  }
};

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

const getTransfers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allTransfers = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current transfers...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/transfers`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
    }

    return { data: allTransfers, total: allTransfers.length };
  } catch (error) {
    console.error("Error getting transfers:", error.message);
    throw error;
  }
};

const getTransfersByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allTransfersForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching transfers for ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/transfers`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "createdDate",
            orderDirection: "DESC",
            lastModifiedFrom: formattedDate,
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
          allTransfersForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} transfers, total: ${allTransfersForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allTransfersForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting transfers by date:`, error.message);
    throw error;
  }
};

// PRICE BOOKS with pagination
const getPriceBooks = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allPriceBooks = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current price books...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/pricebooks`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "name",
          orderDirection: "ASC",
          includePriceBookBranch: true,
          includePriceBookCustomerGroups: true,
          includePriceBookUsers: true,
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
        allPriceBooks.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} price books, total: ${allPriceBooks.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allPriceBooks, total: allPriceBooks.length };
  } catch (error) {
    console.error("Error getting price books:", error.message);
    throw error;
  }
};

// PURCHASE ORDERS with pagination
const getPurchaseOrders = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allPurchaseOrders = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current purchase orders...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/purchaseorders`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
    }

    return { data: allPurchaseOrders, total: allPurchaseOrders.length };
  } catch (error) {
    console.error("Error getting purchase orders:", error.message);
    throw error;
  }
};

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
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/purchaseorders`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "createdDate",
            orderDirection: "DESC",
            lastModifiedFrom: formattedDate,
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

// RECEIPTS with pagination
const getReceipts = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allReceipts = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current receipts...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/receipts`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
        allReceipts.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} receipts, total: ${allReceipts.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allReceipts, total: allReceipts.length };
  } catch (error) {
    console.error("Error getting receipts:", error.message);
    throw error;
  }
};

// RETURNS with pagination
const getReturns = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allReturns = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current returns...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/returns`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
          `Fetched ${response.data.data.length} returns, total: ${allReturns.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allReturns, total: allReturns.length };
  } catch (error) {
    console.error("Error getting returns:", error.message);
    throw error;
  }
};

// SURCHARGES with pagination
const getSurcharges = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allSurcharges = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current surcharges...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/surchages`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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

// NEW: INVENTORY ADJUSTMENTS with pagination
const getInventoryAdjustments = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allAdjustments = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current inventory adjustments...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/stockadjustments`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
        allAdjustments.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} inventory adjustments, total: ${allAdjustments.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allAdjustments, total: allAdjustments.length };
  } catch (error) {
    console.error("Error getting inventory adjustments:", error.message);
    throw error;
  }
};

const getInventoryAdjustmentsByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allAdjustmentsForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching inventory adjustments for ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/stockadjustments`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "createdDate",
            orderDirection: "DESC",
            lastModifiedFrom: formattedDate,
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
          allAdjustmentsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} inventory adjustments, total: ${allAdjustmentsForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allAdjustmentsForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(
      `Error getting inventory adjustments by date:`,
      error.message
    );
    throw error;
  }
};

// NEW: DAMAGE REPORTS with pagination
const getDamageReports = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allDamageReports = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current damage reports...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/damageItems`,
        params: {
          pageSize: pageSize,
          currentItem: currentItem,
          orderBy: "createdDate",
          orderDirection: "DESC",
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
        allDamageReports.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} damage reports, total: ${allDamageReports.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allDamageReports, total: allDamageReports.length };
  } catch (error) {
    console.error("Error getting damage reports:", error.message);
    throw error;
  }
};

const getDamageReportsByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 100;
      const allDamageReportsForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(`Fetching damage reports for ${formattedDate}...`);

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/damageItems`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "createdDate",
            orderDirection: "DESC",
            lastModifiedFrom: formattedDate,
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
          allDamageReportsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${formattedDate}: Fetched ${response.data.data.length} damage reports, total: ${allDamageReportsForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: { data: allDamageReportsForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting damage reports by date:`, error.message);
    throw error;
  }
};

const getCustomerGroups = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allCustomerGroups = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current customer groups...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/customergroups`,
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
        allCustomerGroups.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} customer groups, total: ${allCustomerGroups.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allCustomerGroups, total: allCustomerGroups.length };
  } catch (error) {
    console.error("Error getting customer groups:", error.message);
    throw error;
  }
};

// LOCATIONS with pagination
const getLocations = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allLocations = [];
    let currentItem = 0;
    let hasMoreData = true;

    console.log("Fetching current locations...");

    while (hasMoreData) {
      const response = await makeApiRequest({
        method: "GET",
        url: `${KIOTVIET_BASE_URL}/locations`,
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
        allLocations.push(...response.data.data);
        currentItem += response.data.data.length;
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} locations, total: ${allLocations.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allLocations, total: allLocations.length };
  } catch (error) {
    console.error("Error getting locations:", error.message);
    throw error;
  }
};

// Export all functions
module.exports = {
  // Existing functions
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
  getCategories,
  getBranches,
  getSuppliers,
  getBankAccounts,
  getTransfers,
  getTransfersByDate,
  getPriceBooks,
  getPurchaseOrders,
  getPurchaseOrdersByDate,
  getReceipts,
  getReturns,
  getSurcharges,
  // NEW functions
  getInventoryAdjustments,
  getInventoryAdjustmentsByDate,
  getDamageReports,
  getDamageReportsByDate,
  getCustomerGroups,
  getLocations,
};
