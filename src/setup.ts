/**
 * OpenCV.js Module polyfill
 * Must be executed BEFORE any imports to prevent Module reference errors
 */

// Set up Module global for OpenCV.js WASM loader
if (typeof window !== 'undefined' && !(window as any).Module) {
  (window as any).Module = {};
}

// Also set on globalThis for compatibility
if (typeof globalThis !== 'undefined' && !(globalThis as any).Module) {
  (globalThis as any).Module = {};
}
