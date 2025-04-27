const { getInvoices, getInvoicesByDate } = require("../src/kiotviet");
const {
  saveJsonDataToFile,
  appendJsonDataToFile,
} = require("../saveData/saveData");

const fs = require("fs");
const path = require("path");

const invoiceScheduler = async (daysAgo) => {
  try {
    const invoicesByDate = await getInvoicesByDate(daysAgo);

    const folderName = "saveJson";
    const fileName = "invoices.json";
    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const result = saveJsonDataToFile(invoicesByDate, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot create invoiceSchedulerByDate", error);
    throw error;
  }
};

const invoiceSchedulerCurrent = async () => {
  try {
    const folderName = "saveJson";
    const fileName = "invoices.json";

    const filePath = path.join(
      path.resolve(__dirname, ".."),
      folderName,
      fileName
    );

    const currentInvoices = await getInvoices();
    const result = appendJsonDataToFile(currentInvoices, folderName, fileName);

    return result;
  } catch (error) {
    console.log("Cannot append current invoices", error);
    throw error;
  }
};

module.exports = {
  invoiceScheduler,
  invoiceSchedulerCurrent,
};
