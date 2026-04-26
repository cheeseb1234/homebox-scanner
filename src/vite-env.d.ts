/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_HB_DEFAULT_BASE_URL?: string;
  readonly VITE_HB_MOCK_MODE?: string;
  readonly VITE_HB_OPEN_ENTITY_URL_TEMPLATE?: string;
  readonly VITE_HB_USE_DEV_PROXY?: string;
  readonly VITE_HB_DEV_PROXY_PATH?: string;
  readonly VITE_HB_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  BarcodeDetector: {
    new (options?: { formats?: string[] }): {
      detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
    };
  };
}
