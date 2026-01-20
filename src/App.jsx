import "./App.css";
import { useImageScanner} from "./useImageScanner";
import { usePdfToImages } from "./usePDF";

function App() {
  const { convert, loading: pdfLoading } = usePdfToImages({ scale: 3 });
  const { scanImages, results, loading: qrLoading } = useImageScanner();

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Convert PDF pages to images
    const images = await convert(file);

    // 2. Scan QR codes from images
    await scanImages(images);
  };

  return (
    <>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleChange}
      />

      {(pdfLoading || qrLoading) && <p>Processing PDF & scanning QR...</p>}

      {!results.length && !pdfLoading && !qrLoading && (
        <p>No QR codes found</p>
      )}

      {results.map(({ page, qrs }) => (
        <div key={page} style={{ marginBottom: "1rem" }}>
          <h4>Page {page}</h4>
          {qrs.map((qr, index) => (
            <pre key={index}>{qr.data}</pre>
          ))}
        </div>
      ))}
    </>
  );
}

export default App;
