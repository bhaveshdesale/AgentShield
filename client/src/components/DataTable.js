import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function DataTable({ columns, rows, onRowClick }) {
    if (!rows || rows.length === 0) {
        return (_jsx("div", { className: "text-center py-8 text-neutral-400", children: _jsx("p", { className: "text-sm", children: "No data to display" }) }));
    }
    return (_jsx("div", { className: "overflow-x-auto rounded-lg border border-neutral-200 bg-white", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b border-neutral-200 bg-neutral-50", children: columns.map((col) => (_jsx("th", { className: "px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase", children: col.header }, col.key))) }) }), _jsx("tbody", { children: rows.map((row, i) => (_jsx("tr", { onClick: onRowClick ? () => onRowClick(row) : undefined, className: onRowClick ? "cursor-pointer hover:bg-neutral-50" : "", children: columns.map((col) => (_jsx("td", { className: "px-4 py-2 text-neutral-900", children: col.render ? col.render(row) : row[col.key] }, col.key))) }, i))) })] }) }));
}
