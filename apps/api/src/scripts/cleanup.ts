import { cleanupOldOutputFiles } from "../utils/cleanup-utils";

// Get days to keep from command line argument or use default (30)
const daysToKeep = process.argv[2] ? parseInt(process.argv[2], 10) : 30;

// Run the cleanup
cleanupOldOutputFiles(daysToKeep)
  .then(() => {
    console.log("Cleanup completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
