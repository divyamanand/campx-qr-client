import { useState } from "react";

export default function App() {
  const [supported, setSupported] = useState("BarcodeDetector" in window);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setResults([]);
    setError(null);

    if (!("BarcodeDetector" in window)) {
      setError("BarcodeDetector API is not supported in this browser.");
      return;
    }

    try {
      const imageBitmap = await createImageBitmap(file);

      const detector = new BarcodeDetector({
        formats: ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
      });

      const detectedCodes = await detector.detect(imageBitmap);

      if (detectedCodes.length === 0) {
        setResults(["No codes detected"]);
        return;
      }

      setResults(
        detectedCodes.map((code) => ({
          value: code.rawValue,
          format: code.format,
        }))
      );
    } catch (err) {
      console.error(err);
      setError("Failed to process image");
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>QR / Barcode Scanner</h2>

      {!supported && (
        <p style={{ color: "red" }}>
          BarcodeDetector API not supported in this browser.
          <br />
          Try Chrome or Edge.
        </p>
      )}

      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        disabled={!supported}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ul>
        {results.map((r, idx) => (
          <li key={idx}>
            <strong>{r.format}:</strong> {r.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
