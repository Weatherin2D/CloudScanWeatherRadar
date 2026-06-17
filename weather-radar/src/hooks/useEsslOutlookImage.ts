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
          setError(null);
        } else {
          setImageUrl(null);
          setError("No outlook data available");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setImageUrl(null);
        let msg = "Unknown error";
        if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
          msg = "Network error - check proxy";
        } else if (err instanceof Error) {
          msg = err.message;
        } else {
          msg = String(err);
        }
        console.error("ESSL outline error:", err);
        setError(msg);
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
