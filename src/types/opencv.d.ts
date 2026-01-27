declare module "@techstark/opencv-js" {
  // Mat class
  class Mat {
    constructor();
    constructor(rows: number, cols: number, type: number, scalar?: Scalar);
    cols: number;
    rows: number;
    type(): number;
    clone(): Mat;
    delete(): void;
    data32F: Float32Array;
    data8U: Uint8Array;
  }

  // Size class
  class Size {
    constructor(width: number, height: number);
    width: number;
    height: number;
  }

  // Scalar class
  class Scalar {
    constructor(v0?: number, v1?: number, v2?: number, v3?: number);
  }

  // QRCodeDetector
  class QRCodeDetector {
    constructor();
    detect(img: Mat, points: Mat): boolean;
    decode(img: Mat, points: Mat, decodedText: Mat): string;
    detectAndDecode(img: Mat, points: Mat, decodedText: Mat): boolean;
    delete(): void;
  }

  // Barcode Detector
  class barcode_BarcodeDetector {
    constructor();
    detect(img: Mat): {
      barcodes: string[];
      points: Mat;
    };
    decode(img: Mat, points: Mat): string[];
    delete(): void;
  }

  // Core functions
  function imread(canvas: HTMLCanvasElement): Mat;
  function imshow(canvas: HTMLCanvasElement | string, mat: Mat): void;
  function resize(src: Mat, dst: Mat, size: Size, fx?: number, fy?: number, interpolation?: number): void;
  function cvtColor(src: Mat, dst: Mat, colorspace: number): void;
  function matFromArray(rows: number, cols: number, type: number, array: ArrayLike<number>): Mat;
  function matToString(mat: Mat): string;

  // Constants - Interpolation methods
  const INTER_LINEAR: number;
  const INTER_AREA: number;
  const INTER_CUBIC: number;
  const INTER_NEAREST: number;

  // Constants - Color spaces
  const COLOR_RGBA2GRAY: number;
  const COLOR_RGB2GRAY: number;
  const COLOR_BGR2GRAY: number;
  const COLOR_GRAY2RGBA: number;
  const COLOR_GRAY2RGB: number;

  // Constants - Mat types
  const CV_8U: number;
  const CV_8S: number;
  const CV_16U: number;
  const CV_16S: number;
  const CV_32F: number;
  const CV_64F: number;
}

export {};
