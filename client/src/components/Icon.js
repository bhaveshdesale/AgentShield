import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
export default function Icon({ name, size = 18 }) {
    const paths = {
        grid: _jsxs(_Fragment, { children: [_jsx("rect", { x: "4", y: "4", width: "6", height: "6", rx: "1" }), _jsx("rect", { x: "14", y: "4", width: "6", height: "6", rx: "1" }), _jsx("rect", { x: "4", y: "14", width: "6", height: "6", rx: "1" }), _jsx("rect", { x: "14", y: "14", width: "6", height: "6", rx: "1" })] }),
        bot: _jsxs(_Fragment, { children: [_jsx("path", { d: "M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z" }), _jsx("path", { d: "M12 4v4M9 13h.01M15 13h.01M9 17h6" })] }),
        shield: _jsxs(_Fragment, { children: [_jsx("path", { d: "M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" }), _jsx("path", { d: "m9 12 2 2 4-4" })] }),
        card: _jsxs(_Fragment, { children: [_jsx("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2" }), _jsx("path", { d: "M3 10h18M7 15h3" })] }),
        activity: _jsx(_Fragment, { children: _jsx("path", { d: "M3 12h4l2-6 4 12 2-6h6" }) }),
        arrow: _jsx(_Fragment, { children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) }),
        external: _jsxs(_Fragment, { children: [_jsx("path", { d: "M14 4h6v6M20 4l-9 9" }), _jsx("path", { d: "M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" })] }),
        search: _jsxs(_Fragment, { children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "m20 20-4-4" })] }),
        refresh: _jsxs(_Fragment, { children: [_jsx("path", { d: "M20 11a8 8 0 0 0-14.8-4L3 10M4 13a8 8 0 0 0 14.8 4L21 14" }), _jsx("path", { d: "M3 5v5h5M21 19v-5h-5" })] }),
        menu: _jsx(_Fragment, { children: _jsx("path", { d: "M4 7h16M4 12h16M4 17h16" }) }),
        box: _jsxs(_Fragment, { children: [_jsx("path", { d: "m4 7 8-4 8 4-8 4-8-4Z" }), _jsx("path", { d: "M4 7v10l8 4 8-4V7M12 11v10" })] }),
        x: _jsx(_Fragment, { children: _jsx("path", { d: "m6 6 12 12M18 6 6 18" }) }),
    };
    return _jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: paths[name] ?? paths.shield });
}
