import { useEffect, useState } from "react";
import { fetchEsslOutlookUrl, type EsslOutlookType } from "@/lib/esslOutlook";

export function useEsslOutlookImage(enabled: boolean, type: EsslOutlookType) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setImageUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchEsslOutlookUrl(type)
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setImageUrl(url);
        } else {
          setImageUrl(null);
          setError("ESSL outlook unavailable");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setImageUrl(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, type]);

  return { imageUrl, loading, error };
}
