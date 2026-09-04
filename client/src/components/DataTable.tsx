import type { ReactNode } from "react";

interface DataTableProps {
  columns: { key: string; header: string; render?: (row: unknown) => ReactNode }[];
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}

export default function DataTable({ columns, rows, onRowClick }: DataTableProps) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-400">
        <p className="text-sm">No data to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer hover:bg-neutral-50" : ""}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2 text-neutral-900">
                  {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
