import { useState, useCallback } from "react";
import { scanSingleImage } from "./scanSingleImage";

export function useImageScanner() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scanImages = useCallback(async (images) => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const output = [];

      for (const img of images) {
        const qrResults = await scanSingleImage(img);

        if (qrResults.length > 0) {
          output.push({
            page: img.page,
            qrs: qrResults,
          });
        }
      }

      setResults(output);
      return output;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    scanImages,
    results,
    loading,
    error,
  };
}

