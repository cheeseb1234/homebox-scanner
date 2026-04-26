import { useEffect, useState } from 'react';
import { resolveAttachmentUrl } from '../lib/homebox/api';

interface AuthImageProps {
  baseUrl: string;
  token?: string;
  path?: string;
  alt: string;
}

export function AuthImage({ baseUrl, token, path, alt }: AuthImageProps): JSX.Element | null {
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    const fullUrl = resolveAttachmentUrl(baseUrl, path);
    if (!fullUrl) {
      setImageUrl(undefined);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    async function load(): Promise<void> {
      try {
        const headers = new Headers();
        if (token) headers.set('Authorization', `Bearer ${token}`);

        const response = await fetch(fullUrl!, { headers });
        if (!response.ok) return;

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setImageUrl(objectUrl);
        }
      } catch {
        setImageUrl(undefined);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baseUrl, token, path]);

  if (!imageUrl) return null;
  return <img className="entity-photo" src={imageUrl} alt={alt} />;
}
