import * as fs from "fs/promises";
import * as path from "path";

/**
 * Removes output files older than the specified number of days
 * @param daysToKeep Number of days to keep files for
 */
export async function cleanupOldOutputFiles(
  daysToKeep: number = 30
): Promise<void> {
  try {
    const outputDir = "output";
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - daysToKeep));

    // Get all source directories
    const sourceDirs = await fs.readdir(outputDir);

    for (const sourceDir of sourceDirs) {
      // Skip non-directory files (like the latest symlinks)
      const sourcePath = path.join(outputDir, sourceDir);
      const stats = await fs.stat(sourcePath);
      if (!stats.isDirectory()) continue;

      // Process each year directory
      const yearDirs = await fs.readdir(sourcePath);
      for (const yearDir of yearDirs) {
        const yearPath = path.join(sourcePath, yearDir);
        if (!(await fs.stat(yearPath)).isDirectory()) continue;

        // Process each month directory
        const monthDirs = await fs.readdir(yearPath);
        for (const monthDir of monthDirs) {
          const monthPath = path.join(yearPath, monthDir);
          if (!(await fs.stat(monthPath)).isDirectory()) continue;

          // Process each day directory
          const dayDirs = await fs.readdir(monthPath);
          for (const dayDir of dayDirs) {
            const dayPath = path.join(monthPath, dayDir);
            if (!(await fs.stat(dayPath)).isDirectory()) continue;

            // Check if this day directory is older than cutoff
            const dirDate = new Date(`${yearDir}-${monthDir}-${dayDir}`);
            if (dirDate < cutoffDate) {
              console.log(`Removing old output directory: ${dayPath}`);
              await fs.rm(dayPath, { recursive: true });
            }
          }

          // Clean up empty month directories
          const remainingDays = await fs.readdir(monthPath);
          if (remainingDays.length === 0) {
            await fs.rmdir(monthPath);
          }
        }

        // Clean up empty year directories
        const remainingMonths = await fs.readdir(yearPath);
        if (remainingMonths.length === 0) {
          await fs.rmdir(yearPath);
        }
      }
    }

    console.log(
      `Cleanup complete. Removed files older than ${daysToKeep} days.`
    );
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}
