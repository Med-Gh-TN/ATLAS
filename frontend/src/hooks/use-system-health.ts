import { useEffect, useState } from "react";

export type SystemStatus = "operational" | "degraded" | "outage";

interface HealthPayload {
  status?: "operational" | "degraded" | "outage";
  services?: Record<string, { status?: "operational" | "degraded" | "outage" }>;
}

export function useSystemHealth(enabled: boolean = true, visible: boolean = true) {
  const [status, setStatus] = useState<SystemStatus>("operational");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !visible) {
      setStatus("operational");
      setError(null);
      return;
    }

    const loadHealth = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.atlas.tn/v1";
        const response = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json() as HealthPayload;

        const services = Object.values(payload.services || {});
        const statuses = services.map(s => s.status).concat(payload.status);

        if (statuses.includes("outage")) {
          setStatus("outage");
        } else if (statuses.includes("degraded")) {
          setStatus("degraded");
        } else {
          setStatus("operational");
        }
        setError(null);
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            setError('Health check timeout');
          } else {
            setError('Unable to check system status');
          }
        }
        setStatus("degraded");
      }
    };

    void loadHealth();
    const interval = setInterval(loadHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [enabled, visible]);

  return { status, error };
}