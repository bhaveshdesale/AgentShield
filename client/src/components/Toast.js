import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
export default function Toast({ message, type = "info", duration = 4000, onClose, }) {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);
    const typeColors = {
        success: "bg-success-500",
        error: "bg-danger-500",
        info: "bg-neutral-800",
        warning: "bg-warning-500",
    };
    return (_jsx("div", { className: `pointer-events-auto rounded-lg px-3 py-2 text-xs font-medium text-white shadow-lg ${typeColors[type]}`, children: message }));
}
