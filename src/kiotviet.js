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

    currentToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 3600;
    tokenExpiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);

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
      currentToken = null;
      tokenExpiresAt = null;
      const newToken = await getToken();
      config.headers.Authorization = `Bearer ${newToken}`;
      return await axios(config);
    }
    throw error;
  }
}

const getOrders = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allOrders = [];
    let currentItem = 0;
    let hasMoreData = true;

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
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allOrders, total: allOrders.length };
  } catch (error) {
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
    throw error;
  }
};

const getInvoices = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allInvoices = [];
    let currentItem = 0;
    let hasMoreData = true;

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

const getProducts = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allProducts = [];
    let currentItem = 0;
    let hasMoreData = true;

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
    return results;
  }
};

const getCustomers = async () => {
  try {
    const token = await getToken();
    const pageSize = 100;
    const allCustomers = [];
    let currentItem = 0;
    let hasMoreData = true;

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

        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        hasMoreData = false;
      }
    }

    return { data: allCustomers, total: allCustomers.length };
  } catch (error) {
    throw error;
  }
};

const getCustomersByDate = async (daysAgo, specificDate = null) => {
  try {
    const results = [];

    if (specificDate) {
      const dateParts = specificDate.split("/");
      const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      const token = await getToken();
      const allCustomersForDate = [];
      let hasMoreData = true;
      let currentItem = 0;
      const pageSize = 100;

      while (hasMoreData) {
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
};
