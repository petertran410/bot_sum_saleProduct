const axios = require("axios");
const { getPool } = require("../db");

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";
const LARK_TOKEN_URL =
  "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal";

const CUSTOMER_SYNC_APP_ID = process.env.LARK_CUSTOMER_SYNC_APP_ID;
const CUSTOMER_SYNC_APP_SECRET = process.env.LARK_CUSTOMER_SYNC_APP_SECRET;
const CUSTOMER_SYNC_BASE_TOKEN = process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN;
const CUSTOMER_SYNC_TABLE_ID = process.env.LARK_CUSTOMER_SYNC_TABLE_ID;
const CUSTOMER_SYNC_CHAT_ID = process.env.LARK_CUSTOMER_SYNC_CHAT_ID;

const getCustomerSyncLarkToken = async () => {
  try {
    const response = await axios.post(
      LARK_TOKEN_URL,
      {
        app_id: CUSTOMER_SYNC_APP_ID,
        app_secret: CUSTOMER_SYNC_APP_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );

    return response.data.tenant_access_token;
  } catch (error) {
    console.log("Cannot get lark token", error);
    throw error;
  }
};

const mapCustomerToField = (customer) => {
  return {
    // Primary field - use KiotViet customer ID (Text field)
    Id: customer.id,

    // Customer identification (Text fields)
    "Mã Khách Hàng": customer.code || "",
    "Tên Khách Hàng": customer.name || "",

    // Contact information
    "Số Điện Thoại": customer.contactNumber,
    "Email Khách Hàng": customer.email || "",

    // Address information (Text fields)
    "Địa Chỉ": customer.address || "",
    "Khu Vực": customer.locationName || "",
    "Phường Xã": customer.wardName || "",

    // Business information (Text fields)
    "Công Ty": customer.organization || "",
    "Mã Số Thuế": customer.taxCode || "",

    // Financial information (Text fields - confirmed from Base structure)
    "Nợ Hiện Tại": customer.debt || 0,
    "Tổng Hoá Đơn": customer.totalInvoiced || 0,
    "Tổng Doanh Thu": customer.totalRevenue || 0,
    "Điểm Hiện Tại": customer.rewardPoint || 0,

    // Store information (Text field)
    "Cửa Hàng": "2svn",

    // Dates - format for Lark datetime fields (DateTime fields)
    "Thời Gian Tạo": customer.createdDate
      ? formatDateForLark(customer.createdDate)
      : null,
    "Thời Gian Cập Nhật": customer.modifiedDate
      ? formatDateForLark(customer.modifiedDate)
      : formatDateForLark(new Date()),
    "Ngày Sinh": customer.birthDate
      ? formatDateForLark(customer.birthDate)
      : null,

    // Gender - map to Lark single select options (Single select field)
    "Giới tính": mapGenderToLarkOption(customer.gender),

    // Notes (Text field)
    "Ghi Chú": customer.comments || "",
  };
};

const mapGenderToLarkOption = (gender) => {
  if (gender === true) return "nam";
  if (gender === false) return "nữ";

  return null;
};

const formatDateForLark = (dateInput) => {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;

    return date.getTime();
  } catch (error) {
    console.log("Date formatting error:", error.message);
    throw error;
  }
};

const addCustomerToLarkBase = async (customer) => {
  try {
    if (!CUSTOMER_SYNC_BASE_TOKEN || !CUSTOMER_SYNC_TABLE_ID) {
      throw new Error("Missing Lark Base configuration for customer sync");
    }

    const token = await getCustomerSyncLarkToken();

    const mapFields = mapCustomerToField(customer);

    const recordDate = {
      fields: mapFields,
    };

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records`,
      recordDate,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0) {
      const record = response.data.data.record;
      console.log(
        `✅ Customer ${customer.code} added successfully: ${record.record_id}`
      );

      return {
        success: true,
        record_id: record.record_id,
        data: record,
      };
    } else {
      console.log("Lakr API is error", response.data);
      throw new Error(
        `Failed to add customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.log("Cannot add customer to lark", error);

    if (error.response?.data?.code === 1254001) {
      console.log(
        `⚠️ Customer ${customer.code} already exists in Lark, updating instead...`
      );
      return await updateCustomerInLarkBase(customer);
    }

    return { success: false, error: error.message };
  }
};

const findCustomerInLarkBase = async (customerId) => {
  try {
    const token = await getCustomerSyncLarkToken();

    const response = await axios.post(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/search`,
      {
        filter: {
          conditions: [
            {
              field_name: "Id",
              operator: "is",
              value: [customerId.toString()],
            },
          ],
          conjunction: "and",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0 && response.data.data.items.length > 0) {
      return response.data.data.items[0];
    }

    return null;
  } catch (error) {
    console.log("Cannot find customer in lark", error);
    throw error;
  }
};

const updateCustomerInLarkBase = async (customer) => {
  try {
    const existingRecord = await findCustomerInLarkBase(customer.id);

    if (!existingRecord) {
      return await addCustomerToLarkBase(customer);
    }

    const token = await getCustomerSyncLarkToken();

    const mapFields = mapCustomerToField(customer);

    console.log(`Updating customer ${customer.code}`);

    const updateData = {
      fields: mapFields,
    };

    const response = await axios.put(
      `${LARK_BASE_URL}/bitable/v1/apps/${CUSTOMER_SYNC_BASE_TOKEN}/tables/${CUSTOMER_SYNC_TABLE_ID}/records/${existingRecord.record_id}`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data.code === 0) {
      console.log("Customer updated successfully");
      return {
        success: true,
        record_id: existingRecord.record_id,
        data: response.data.data.record,
        updated: true,
      };
    } else {
      throw new Error(
        `Failed to update customer: ${response.data.msg || "Unknown error"}`
      );
    }
  } catch (error) {
    console.log("Cannot update customer in lark", error);
    throw error;
  }
};

const saveSyncCustomerIntoLark = async (customer) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  let successCount = 0;
  let failCount = 0;
  let newCount = 0;
  let existingCount = 0;

  const BATCH_SIZE = 50;
  console.log(
    `Processing ${customers.length} customers in batches of ${BATCH_SIZE}`
  );
  try {
  } catch (error) {}
};
