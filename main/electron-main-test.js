console.log("Main process starting...");
console.log("process.type:", process.type);
console.log("process.versions.electron:", process.versions.electron);

// Try different require approaches
try {
  const electron = require("electron");
  console.log("require('electron') type:", typeof electron);
} catch(e) {
  console.log("require('electron') failed:", e.code);
}

try {
  const { app } = eval("require('electron')");
  console.log("eval require app:", typeof app);
} catch(e) {
  console.log("eval failed:", e.message);
}

// Check global
console.log("global.electron:", typeof global.electron);

// Exit
setTimeout(() => process.exit(0), 1000);
