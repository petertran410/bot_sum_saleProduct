// // src/kiotviet.js
// const axios = require("axios");

// const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;
// const TOKEN_URL = "https://id.kiotviet.vn/connect/token";

// async function getToken() {
//   try {
//     const response = await axios.post(
//       TOKEN_URL,
//       new URLSearchParams({
//         client_id: process.env.KIOT_CLIEND_ID,
//         client_secret: process.env.KIOT_SECRET_KEY,
//         grant_type: "client_credentials",
//         scopes: "PublicApi.Access",
//       }),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     return response.data.access_token;
//   } catch (error) {
//     console.error("Error getting KiotViet token:", error.message);
//     throw error;
//   }
// }

// async function registerWebhook() {
//   try {
//     const token = await getToken();

//     const webhookData = {
//       Webhook: {
//         Type: "order.update",
//         Url: "https://704d-14-224-133-28.ngrok-free.app/webhook/kiotviet",
//         IsActive: true,
//         Description: "Webhook for order updates",
//         Secret: "dieptra",
//       },
//     };

//     const response = await axios.post(
//       "https://public.kiotapi.com/webhooks",
//       webhookData,
//       {
//         headers: {
//           Retailer: "2svn",
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     console.log("Webhook registered successfully:", response.data);
//     return response.data;
//   } catch (error) {
//     console.error("Error registering webhook:", error);
//     throw error;
//   }
// }

// async function getPendingOrders() {
//   try {
//     const token = await getToken();

//     const response = await axios.get(`${KIOTVIET_BASE_URL}/orders?{}`, {
//       params: {
//         status: 1,
//         pageSize: 1,
//         orderBy: "createdDate",
//         orderDirection: "DESC",
//       },
//       headers: {
//         Retailer: process.env.KIOT_SHOP_NAME,
//         Authorization: `Bearer ${token}`,
//       },
//     });

//     return response.data.data || [];
//   } catch (error) {
//     console.error("Error getting pending orders:", error.message);
//     throw error;
//   }
// }

// async function getModifiedOrders() {
//   try {
//     const token = await getToken();

//     const yesterday = new Date();
//     yesterday.setDate(yesterday.getDate() - 1);
//     const formattedDate = yesterday.toISOString().split("T")[0];

//     const response = await axios.get(`${KIOTVIET_BASE_URL}/orders`, {
//       params: {
//         lastModifiedFrom: formattedDate,
//         pageSize: 100,
//       },
//       headers: {
//         Retailer: process.env.KIOT_SHOP_NAME,
//         Authorization: `Bearer ${token}`,
//       },
//     });

//     const orders = response.data.data || [];
//     return orders.filter((order) => {
//       return (
//         order.description &&
//         order.description.toLowerCase().includes("thiếu hàng")
//       );
//     });
//   } catch (error) {
//     console.error("Error getting modified orders:", error.message);
//     throw error;
//   }
// }

// module.exports = {
//   getToken,
//   getPendingOrders,
//   getModifiedOrders,
//   registerWebhook,
// };

// src/kiotviet.js
const axios = require("axios");

const KIOTVIET_BASE_URL = process.env.KIOT_BASE_URL;
const TOKEN_URL = "https://id.kiotviet.vn/connect/token";

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
    console.error("Error getting KiotViet token:", error.message);
    throw error;
  }
}

async function getPendingOrders() {
  try {
    const token = await getToken();

    const response = await axios.get(`${KIOTVIET_BASE_URL}/orders?{}`, {
      params: {
        status: 1,
        pageSize: 1,
        orderBy: "createdDate",
        orderDirection: "DESC",
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.data || [];
  } catch (error) {
    console.error("Error getting pending orders:", error.message);
    throw error;
  }
}

async function getModifiedOrders() {
  try {
    const token = await getToken();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedDate = yesterday.toISOString().split("T")[0];

    const response = await axios.get(`${KIOTVIET_BASE_URL}/orders`, {
      params: {
        lastModifiedFrom: formattedDate,
        pageSize: 100,
      },
      headers: {
        Retailer: process.env.KIOT_SHOP_NAME,
        Authorization: `Bearer ${token}`,
      },
    });

    const orders = response.data.data || [];
    return orders.filter((order) => {
      return (
        order.description &&
        order.description.toLowerCase().includes("thiếu hàng")
      );
    });
  } catch (error) {
    console.error("Error getting modified orders:", error.message);
    throw error;
  }
}

module.exports = {
  getToken,
  getPendingOrders,
  getModifiedOrders,
};
