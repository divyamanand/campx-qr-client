console.log("===MAIN PROCESS===");
console.log("process.type:", process.type);

const { app } = require("electron");

console.log("app type:", typeof app);

if (typeof app === 'undefined') {
  console.error("ERROR: app is undefined");
  process.exit(1);
}

console.log("SUCCESS: app is available");
process.exit(0);
