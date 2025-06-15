// test/testLarkCustomerSync.js - Test script for Lark customer sync functionality
require("dotenv").config();

const {
  addCustomerToLarkBase,
  syncCustomersToLarkBase,
  mapCustomerToLarkFields,
  getCustomerSyncLarkToken,
} = require("../lark/customerLarkService");

const {
  customerLarkSchedulerCurrent,
  triggerManualCustomerLarkSync,
} = require("../../scheduler/customerLarkScheduler");

/**
 * Test Lark connection and configuration
 */
async function testLarkConnection() {
  console.log("\n🔧 Testing Lark Connection...");

  try {
    const token = await getCustomerSyncLarkToken();

    if (token) {
      console.log("✅ Customer sync Lark token obtained successfully");
      console.log(
        "✅ App ID:",
        process.env.LARK_CUSTOMER_SYNC_APP_ID ? "Configured" : "❌ Missing"
      );
      console.log(
        "✅ App Secret:",
        process.env.LARK_CUSTOMER_SYNC_APP_SECRET ? "Configured" : "❌ Missing"
      );
      console.log(
        "✅ Base Token:",
        process.env.LARK_CUSTOMER_SYNC_BASE_TOKEN ? "Configured" : "❌ Missing"
      );
      console.log(
        "✅ Table ID:",
        process.env.LARK_CUSTOMER_SYNC_TABLE_ID ? "Configured" : "❌ Missing"
      );
      console.log(
        "✅ Chat ID:",
        process.env.LARK_CUSTOMER_SYNC_CHAT_ID ? "Configured" : "❌ Missing"
      );
      return true;
    } else {
      console.log("❌ Failed to get customer sync Lark token");
      return false;
    }
  } catch (error) {
    console.log("❌ Customer sync Lark connection failed:", error.message);
    return false;
  }
}

/**
 * Test field mapping with sample data
 */
function testFieldMapping() {
  console.log("\n📊 Testing Field Mapping...");

  const sampleCustomer = {
    id: 12345,
    code: "KH001",
    name: "Nguyễn Văn Test",
    contactNumber: "0123456789",
    email: "test@example.com",
    address: "123 Test Street",
    locationName: "Hồ Chí Minh",
    wardName: "Phường 1",
    organization: "Test Company",
    taxCode: "0123456789",
    comments: "Test customer",
    debt: 100000,
    totalInvoiced: 5000000,
    rewardPoint: 150,
    retailerId: 1,
    createdDate: "2025-06-15T10:00:00Z",
    modifiedDate: "2025-06-15T12:00:00Z",
    gender: true,
  };

  const mappedFields = mapCustomerToLarkFields(sampleCustomer);

  console.log("Sample Customer Data:");
  console.log(JSON.stringify(sampleCustomer, null, 2));

  console.log("\nMapped Lark Fields:");
  console.log(JSON.stringify(mappedFields, null, 2));

  console.log("✅ Field mapping test completed");
  return mappedFields;
}

/**
 * Test adding a single customer to Lark
 */
async function testSingleCustomerAdd() {
  console.log("\n👤 Testing Single Customer Add...");

  const testCustomer = {
    id: Date.now(), // Use timestamp to avoid duplicates
    code: `TEST-${Date.now()}`,
    name: "Test Customer " + new Date().toLocaleTimeString(),
    contactNumber: "0987654321",
    email: "testcustomer@example.com",
    address: "Test Address",
    locationName: "TP. HCM",
    wardName: "Quận 1",
    organization: "Test Org",
    taxCode: "1234567890",
    comments: "Created by test script",
    debt: 0,
    totalInvoiced: 1000000,
    rewardPoint: 10,
    retailerId: 1,
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
    gender: true,
  };

  try {
    const result = await addCustomerToLarkBase(testCustomer);

    if (result.success) {
      console.log("✅ Test customer added successfully");
      console.log("📋 Record ID:", result.record_id);
      return result;
    } else {
      console.log("❌ Failed to add test customer:", result.error);
      return null;
    }
  } catch (error) {
    console.log("❌ Error adding test customer:", error.message);
    return null;
  }
}

/**
 * Test batch customer sync
 */
async function testBatchCustomerSync() {
  console.log("\n👥 Testing Batch Customer Sync...");

  const testCustomers = [];
  const timestamp = Date.now();

  // Create 3 test customers
  for (let i = 1; i <= 3; i++) {
    testCustomers.push({
      id: timestamp + i,
      code: `BATCH-${timestamp}-${i}`,
      name: `Batch Test Customer ${i}`,
      contactNumber: `098765432${i}`,
      email: `batch${i}@example.com`,
      address: `Batch Address ${i}`,
      locationName: "TP. HCM",
      wardName: `Quận ${i}`,
      organization: `Batch Org ${i}`,
      taxCode: `123456789${i}`,
      comments: `Batch test customer ${i}`,
      debt: i * 10000,
      totalInvoiced: i * 1000000,
      rewardPoint: i * 10,
      retailerId: 1,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      gender: i % 2 === 1,
    });
  }

  try {
    const result = await syncCustomersToLarkBase(testCustomers);

    if (result.success) {
      console.log("✅ Batch sync completed successfully");
      console.log("📊 Stats:", result.stats);
      return result;
    } else {
      console.log("❌ Batch sync failed:", result.error);
      return null;
    }
  } catch (error) {
    console.log("❌ Error in batch sync:", error.message);
    return null;
  }
}

/**
 * Test current customer scheduler
 */
async function testCurrentScheduler() {
  console.log("\n⏰ Testing Current Customer Scheduler...");

  try {
    const result = await customerLarkSchedulerCurrent();

    if (result.success) {
      console.log("✅ Current scheduler test completed");
      console.log("📊 Result:", result);
      return result;
    } else {
      console.log("❌ Current scheduler test failed:", result.error);
      return null;
    }
  } catch (error) {
    console.log("❌ Error in current scheduler test:", error.message);
    return null;
  }
}

/**
 * Test manual trigger functionality
 */
async function testManualTrigger() {
  console.log("\n🔧 Testing Manual Trigger...");

  try {
    const result = await triggerManualCustomerLarkSync({
      daysAgo: 1,
      forceFullSync: false,
    });

    if (result.success) {
      console.log("✅ Manual trigger test completed");
      console.log("📊 Result:", result);
      return result;
    } else {
      console.log("❌ Manual trigger test failed:", result.error);
      return null;
    }
  } catch (error) {
    console.log("❌ Error in manual trigger test:", error.message);
    return null;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("🚀 Starting Lark Customer Sync Tests...");
  console.log("⏰ Test started at:", new Date().toISOString());

  const testResults = {
    connection: false,
    fieldMapping: false,
    singleAdd: false,
    batchSync: false,
    currentScheduler: false,
    manualTrigger: false,
  };

  try {
    // Test 1: Connection
    testResults.connection = await testLarkConnection();

    if (!testResults.connection) {
      console.log("\n❌ Connection test failed. Stopping tests.");
      return testResults;
    }

    // Test 2: Field Mapping
    try {
      testFieldMapping();
      testResults.fieldMapping = true;
    } catch (error) {
      console.log("❌ Field mapping test failed:", error.message);
    }

    // Test 3: Single Customer Add
    const singleResult = await testSingleCustomerAdd();
    testResults.singleAdd = singleResult !== null;

    // Test 4: Batch Sync
    const batchResult = await testBatchCustomerSync();
    testResults.batchSync = batchResult !== null;

    // Test 5: Current Scheduler (only if previous tests passed)
    if (testResults.singleAdd && testResults.batchSync) {
      const schedulerResult = await testCurrentScheduler();
      testResults.currentScheduler = schedulerResult !== null;
    }

    // Test 6: Manual Trigger
    const triggerResult = await testManualTrigger();
    testResults.manualTrigger = triggerResult !== null;
  } catch (error) {
    console.log("❌ Test suite failed:", error.message);
  }

  // Summary
  console.log("\n📋 TEST SUMMARY");
  console.log("================");
  console.log("🔧 Connection:", testResults.connection ? "✅ PASS" : "❌ FAIL");
  console.log(
    "📊 Field Mapping:",
    testResults.fieldMapping ? "✅ PASS" : "❌ FAIL"
  );
  console.log("👤 Single Add:", testResults.singleAdd ? "✅ PASS" : "❌ FAIL");
  console.log("👥 Batch Sync:", testResults.batchSync ? "✅ PASS" : "❌ FAIL");
  console.log(
    "⏰ Current Scheduler:",
    testResults.currentScheduler ? "✅ PASS" : "❌ FAIL"
  );
  console.log(
    "🔧 Manual Trigger:",
    testResults.manualTrigger ? "✅ PASS" : "❌ FAIL"
  );

  const passedTests = Object.values(testResults).filter(
    (result) => result === true
  ).length;
  const totalTests = Object.keys(testResults).length;

  console.log(`\n🎯 Results: ${passedTests}/${totalTests} tests passed`);
  console.log("⏰ Test completed at:", new Date().toISOString());

  if (passedTests === totalTests) {
    console.log("🎉 All tests passed! Lark customer sync is ready to use.");
  } else {
    console.log(
      "⚠️ Some tests failed. Please check the configuration and try again."
    );
  }

  return testResults;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then((results) => {
      console.log("\n✅ Test script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test script failed:", error);
      process.exit(1);
    });
}

module.exports = {
  testLarkConnection,
  testFieldMapping,
  testSingleCustomerAdd,
  testBatchCustomerSync,
  testCurrentScheduler,
  testManualTrigger,
  runAllTests,
};
