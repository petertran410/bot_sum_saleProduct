require("dotenv").config();
const { getCustomersByDate } = require("../src/kiotviet");
const {
  customerSchedulerSpecificDate,
} = require("../scheduler/customerScheduler");

const syncSpecificDate = async () => {
  try {
    console.log("Starting sync for 22/12/2024");
    await customerSchedulerSpecificDate("22/12/2024");
    console.log("Sync completed successfully");
  } catch (error) {
    console.error("Error during sync:", error);
  }
};

syncSpecificDate();
