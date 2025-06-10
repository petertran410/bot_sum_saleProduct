// Create: force-location-sync.js
require("dotenv").config();

const forceLocationSync = async () => {
  try {
    console.log("🔄 Force syncing all locations...");

    // Import the function
    const { runLocationSync } = require("./src/syncKiot/syncKiot");

    // Force sync (true parameter forces sync even if locations exist)
    const result = await runLocationSync(true);

    console.log("📊 Sync Result:", {
      success: result.success,
      message: result.message,
      savedCount: result.savedCount || 0,
      skipped: result.skipped || false,
    });

    if (result.success) {
      console.log("✅ Location force sync completed successfully!");
    } else {
      console.error("❌ Location force sync failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Force sync error:", error.message);
  }

  process.exit(0);
};

forceLocationSync();
