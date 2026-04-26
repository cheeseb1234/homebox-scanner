import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useEffect, useRef, useState } from 'react';

interface CameraScanButtonProps {
  onDetected: (value: string) => void;
}

type ScannerState = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'error';

const barcodeFormats = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

const zxingHints = new Map<DecodeHintType, BarcodeFormat[]>();
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E
]);

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

async function getCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a camera from this page. Use HTTPS and a browser with camera support.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (caught) {
    // Some desktop webcams reject environment-facing constraints. Retry with any camera.
    if (caught instanceof DOMException && /OverconstrainedError|Constraint/i.test(caught.name)) {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw caught;
  }
}

export function CameraScanButton({ onDetected }: CameraScanButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScannerState>('idle');
  const [error, setError] = useState<string>('');
  const [engine, setEngine] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let stream: MediaStream | null = null;
    let timerId = 0;
    let controls: IScannerControls | undefined;

    async function startNativeDetector(): Promise<boolean> {
      if (!('BarcodeDetector' in window)) return false;
      if (!videoRef.current) return false;

      const Detector = window.BarcodeDetector;
      const detector = new Detector({ formats: barcodeFormats });
      setEngine('native BarcodeDetector');

      const loop = async (): Promise<void> => {
        if (!active || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const first = results.find((item: { rawValue?: string }) => item.rawValue);
          if (first?.rawValue) {
            onDetected(first.rawValue);
            setOpen(false);
            return;
          }
        } catch {
          // Some browsers throw while video dimensions settle. Keep scanning.
        }
        timerId = window.setTimeout(() => void loop(), 180);
      };

      await loop();
      return true;
    }

    async function startZxingFallback(): Promise<void> {
      if (!videoRef.current) return;
      setEngine('ZXing fallback');
      const reader = new BrowserMultiFormatReader(zxingHints);
      controls = await reader.decodeFromStream(stream!, videoRef.current, (result) => {
        const value = result?.getText();
        if (!value || !active) return;
        onDetected(value);
        setOpen(false);
      });
    }

    async function start(): Promise<void> {
      setState('starting');
      setError('');
      setEngine('');

      try {
        stream = await getCameraStream();
        if (!active || !videoRef.current) {
          stopStream(stream);
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setState('scanning');

        const nativeStarted = await startNativeDetector();
        if (!nativeStarted) await startZxingFallback();
      } catch (caught) {
        stopStream(stream);
        if (!active) return;
        setState(caught instanceof Error && /BarcodeDetector|ZXing|format|No MultiFormat Readers/i.test(caught.message) ? 'unsupported' : 'error');
        setError(caught instanceof Error ? caught.message : 'Unable to start camera scanner');
      }
    }

    void start();

    return () => {
      active = false;
      if (timerId) window.clearTimeout(timerId);
      controls?.stop();
      stopStream(stream);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [open, onDetected]);

  return (
    <>
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        Camera
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Camera Scan</h3>
              <button type="button" className="text-button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            {state === 'unsupported' ? (
              <p className="helper-text">Camera opened, but barcode scanning is not supported in this browser. Try Chrome/Edge or use the text search box.</p>
            ) : state === 'error' ? (
              <>
                <p className="helper-text">{error}</p>
                <p className="helper-text">If permission was blocked, allow camera access for this site and try again.</p>
              </>
            ) : (
              <>
                <video ref={videoRef} className="camera-preview" muted playsInline autoPlay />
                <p className="helper-text">
                  {state === 'starting' ? 'Starting camera…' : `Point the camera at a barcode or QR code${engine ? ` (${engine})` : ''}.`}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
