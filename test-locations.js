require("dotenv").config();
const { getLocations } = require("./src/kiotviet");

const testLocations = async () => {
  try {
    console.log("🧪 Testing locations API...");
    const result = await getLocations();
    console.log("Result:", {
      success: true,
      totalLocations: result.data.length,
      sampleLocation: result.data[0],
    });
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
  process.exit(0);
};

testLocations();
