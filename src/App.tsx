import { useEffect, useRef, useState } from "react";
import { opencvInit } from "@shencom/wechat-opencv";

/**
 * Declare global config used by @shencom/wechat-opencv
 */
declare global {
  interface Window {
    OPENCV_JS_PATH?: string;
    WECHAT_QRCODE_JS_PATH?: string;
  }
}

function App() {
  const cvRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 🔹 Initialize OpenCV + WeChat QR ONCE
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // ✅ Override default CDN paths (prevents 403)
        window.OPENCV_JS_PATH = "/wechat_opencv/opencv.js";
        window.WECHAT_QRCODE_JS_PATH =
          "/wechat_opencv/wechat_qrcode_files.js";

        // ✅ Must be called with NO arguments
        const cv = await opencvInit();

        if (!mounted) return;

        cvRef.current = cv;

        // ✅ Initialize WeChat QR detector
        detectorRef.current = new cv.wechat_qrcode_WeChatQRCode(
          "/wechat_qrcode/detect.prototxt",
          "/wechat_qrcode/detect.caffemodel",
          "/wechat_qrcode/sr.prototxt",
          "/wechat_qrcode/sr.caffemodel"
        );

        setReady(true);
        console.log("✅ WeChat QR initialized");
      } catch (e: any) {
        console.error(e);
        setError("Failed to initialize OpenCV");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 🔹 Handle file input
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ready) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.crossOrigin = "anonymous";

    img.onload = () => decodeImage(img);
  };

  // 🔹 Decode QR codes
  const decodeImage = (img: HTMLImageElement) => {
    const cv = cvRef.current;
    const detector = detectorRef.current;
    if (!cv || !detector) return;

    setLoading(true);
    setResult([]);
    setError(null);

    try {
      const mat = cv.imread(img);
      const points = new cv.MatVector();
      const decoded = detector.detectAndDecode(mat, points);

      const results: string[] = [];
      for (let i = 0; i < decoded.size(); i++) {
        results.push(decoded.get(i));
      }

      setResult(results.length ? results : ["No QR code detected"]);

      // 🔥 OpenCV memory cleanup (MANDATORY)
      mat.delete();
      points.delete();
      decoded.delete();
    } catch (err) {
      console.error(err);
      setError("Failed to decode image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h2>📷 WeChat QR Decoder (OpenCV)</h2>

      {!ready && <p>Loading OpenCV…</p>}

      <input
        type="file"
        accept="image/*"
        disabled={!ready || loading}
        onChange={onFileChange}
      />

      {loading && <p>Decoding…</p>}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {result.length > 0 && (
        <ul>
          {result.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
