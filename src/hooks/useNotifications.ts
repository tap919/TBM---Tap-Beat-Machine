import { useState, useCallback, useRef, useEffect } from "react";

export interface Notification {
  type: "success" | "error";
  message: string;
}

export function useNotifications(durationMs = 3000) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback(
    (type: "success" | "error", message: string) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setNotification({ type, message });
      timerRef.current = setTimeout(() => {
        setNotification(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return { notification, showNotification };
}
