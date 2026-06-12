import { CheckCircle2, AlertCircle } from "lucide-react";
import type { Notification } from "../hooks/useNotifications";

interface Props {
  notification: Notification | null;
}

export function NotificationToast({ notification }: Props) {
  if (!notification) return null;
  return (
    <div className="absolute bottom-24 right-6 z-100 animate-in slide-in-from-right-8">
      <div
        className={`relative flex items-center gap-3 px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-sm stripe-left ${
          notification.type === "success"
            ? "bg-emerald-950/90 border-emerald-700/60 text-emerald-300 shadow-emerald-900/30"
            : "bg-red-950/90 border-red-700/60 text-red-300 shadow-red-900/30"
        }`}
      >
        {notification.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        <span className="text-sm font-bold uppercase tracking-widest">{notification.message}</span>
      </div>
    </div>
  );
}
