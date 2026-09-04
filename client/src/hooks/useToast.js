import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useCallback, useState } from "react";
const ToastContext = createContext({ showToast: () => { } });
export function useToast() {
    return useContext(ToastContext);
}
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const showToast = useCallback((message, type = "info") => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    }, []);
    return (_jsx(ToastContext.Provider, { value: { showToast }, children: children }));
}
