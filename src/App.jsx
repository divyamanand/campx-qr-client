import "./App.css";
import { usePdfToImages } from "./usePDF";
import { useQrFromImages } from "./useImageScanner";

function App() {
  const { convert, loading: pdfLoading } = usePdfToImages({ scale: 4 });
  const { scanImages, results, loading: qrLoading } = useQrFromImages();

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const images = await convert(file);
    await scanImages(images);
  };

  return (
    <>
      <input
        type="file"
        accept="application/pdf"
        onChange={handleChange}
      />

      {(pdfLoading || qrLoading) && (
        <p>Processing PDF & scanning codes...</p>
      )}

      {!results.length && !pdfLoading && !qrLoading && (
        <p>No QR / barcodes found</p>
      )}

      {results.map(({ page, qrCode, barcode }) => (
  <div key={page}>
    <h4>Page {page}</h4>
    {qrCode && <p>QR: {qrCode}</p>}
    {barcode && <p>Barcode: {barcode}</p>}
  </div>
))}

    </>
  );
}

export default App;
