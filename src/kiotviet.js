const axios = require("axios");
const { orderBy } = require("lodash");

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

const getCustomers = async (pageSize = 200, currentItem = 0) => {
  try {
    const token = await getToken();

    pageSize = Math.min(pageSize, 200);

    const response = await axios.get(`${KIOTVIET_BASE_URL}/customers`, {
      params: {
        pageSize: pageSize,
        orderBy: "createdDate",
        orderDirection: "DESC",
        includeTotal: true,
        includeCustomerGroup: true,
        includeCustomerSocial: true,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    console.log(
      `Fetched ${response.data.data.length} customers, total: ${response.data.total}, currentItem: ${currentItem}`
    );

    return response.data;
  } catch (error) {
    console.log("Error fetching customers:", error.message);
    throw error;
  }
};

const getCustomersByDate = async (daysAgo) => {
  try {
    const results = [];
    let currentDaysAgo = daysAgo;

    for (currentDaysAgo >= 0; currentDaysAgo--; ) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - currentDaysAgo);

      const formattedDate = targetDate.toISOString().split("T")[0];

      const token = await getToken();
      const pageSize = 200;

      const response = await axios.get(`${KIOTVIET_BASE_URL}/customers?{}`, {
        params: {
          pageSize: pageSize,
          orderBy: "createdDate",
          orderDirection: "DESC",
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

      results.push({
        date: formattedDate,
        daysAgo: currentDaysAgo,
        data: response.data,
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }

    return results;
  } catch (error) {
    console.log(
      `Error getting customers for ${daysAgo} days ago:`,
      error.message
    );
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
