import { execSync } from "node:child_process";

const MAX_FILES_PER_FOLDER = 99;

const files = execSync("git ls-files", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const counts = new Map();
for (const file of files) {
  const parts = file.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
}

const overLimit = [...counts.entries()]
  .filter(([, count]) => count > MAX_FILES_PER_FOLDER)
  .sort((a, b) => b[1] - a[1]);

if (overLimit.length) {
  console.error(
    `Found folders with more than ${MAX_FILES_PER_FOLDER} tracked files:`,
  );
  for (const [dir, count] of overLimit) {
    console.error(`  ${dir}: ${count}`);
  }
  process.exit(1);
}

console.log(
  `All ${counts.size} tracked folders are within the ${MAX_FILES_PER_FOLDER}-file limit.`,
);
