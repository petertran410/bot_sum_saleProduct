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

const getCustomerGroups = async () => {
  try {
    const token = await getToken();

    console.log("Fetching customer groups...");

    const response = await makeApiRequest({
      method: "GET",
      url: `${KIOTVIET_BASE_URL}/customers/group`,
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.data) {
      console.log(`Retrieved ${response.data.total || 0} customer groups`);
      return {
        data: response.data.data || [],
        total: response.data.total || response.data.data?.length || 0,
      };
    }

    return { data: [], total: 0 };
  } catch (error) {
    console.error("Error getting customer groups:", error.message);
    throw error;
  }
};

const getCustomerGroupsByDate = async (daysAgo) => {
  try {
    // Customer groups don't support date filtering according to the API documentation
    // So we'll just get all customer groups once
    console.log(
      `Note: Customer groups don't support date filtering. Getting all groups.`
    );

    const customerGroups = await getCustomerGroups();

    // Return in the same format as other date-based functions for consistency
    const results = [
      {
        date: new Date().toISOString().split("T")[0],
        daysAgo: 0,
        data: customerGroups,
      },
    ];

    return results;
  } catch (error) {
    console.error("Error getting customer groups by date:", error.message);
    return [];
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
          isReceipt: true,
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
        hasMoreData = response.data.data.length === pageSize;

        console.log(
          `Fetched ${response.data.data.length} cashflows, total: ${allCashflows.length}`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allCashflows, total: allCashflows.length };
  } catch (error) {
    console.error("Error getting cashflows:", error.message);
    throw error;
  }
};

const getCashflowByDate = async (daysAgo) => {
  try {
    const results = [];

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const token = await getToken();
      const pageSize = 100;
      const allCashflowsForDate = [];
      let currentItem = 0;
      let hasMoreData = true;

      console.log(
        `Fetching cashflows for ${targetDate.toISOString().split("T")[0]}...`
      );

      while (hasMoreData) {
        const response = await makeApiRequest({
          method: "GET",
          url: `${KIOTVIET_BASE_URL}/cashflow`,
          params: {
            pageSize: pageSize,
            currentItem: currentItem,
            orderBy: "transDate",
            orderDirection: "DESC",
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
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
          allCashflowsForDate.push(...response.data.data);
          currentItem += response.data.data.length;
          hasMoreData = response.data.data.length === pageSize;

          console.log(
            `Date ${targetDate.toISOString().split("T")[0]}: Fetched ${
              response.data.data.length
            } cashflows, total: ${allCashflowsForDate.length}`
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          hasMoreData = false;
        }
      }

      results.push({
        date: targetDate.toISOString().split("T")[0],
        daysAgo: currentDaysAgo,
        data: { data: allCashflowsForDate },
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  } catch (error) {
    console.error(`Error getting cashflows by date:`, error.message);
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
  getCustomerGroups,
  getCustomerGroupsByDate,
  getCashflow,
  getCashflowByDate,
};
