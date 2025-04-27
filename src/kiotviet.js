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

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
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

    for (let currentDaysAgo = daysAgo; currentDaysAgo >= 0; currentDaysAgo--) {
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
        // productType: 1 | 2 | 3,
        // includeMaterial: true,
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

    return response.data;
  } catch (error) {
    console.error("Error getting products:", error.message);
    throw error;
  }
};

const getProductsByDate = async (date) => {
  try {
    const token = await getToken();
    const pageSize = 100;

    const response = await axios.get(`${KIOTVIET_BASE_URL}/products`, {
      params: {
        lastModifiedFrom: date,
        pageSize: pageSize,
        includeInventory: true,
        includePricebook: true,
        orderBy: "name",
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error(`Error getting products for date ${date}:`, error.message);
    return { data: [] };
  }
};

module.exports = {
  getOrders,
  getOrdersByDate,
  getInvoices,
  getInvoicesByDate,
  getProducts,
  getProductsByDate,
};
