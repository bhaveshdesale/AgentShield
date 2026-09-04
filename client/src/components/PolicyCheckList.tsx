import type { PolicyCheck } from "../types";

interface PolicyCheckListProps {
  checks: PolicyCheck[];
}

export default function PolicyCheckList({ checks }: PolicyCheckListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            <th className="px-4 py-2 text-left font-medium text-neutral-600">Check</th>
            <th className="px-4 py-2 text-center font-medium text-neutral-600">Result</th>
            <th className="px-4 py-2 text-left font-medium text-neutral-600">Detail</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.name} className="border-b border-neutral-200 last:border-0">
              <td className="px-4 py-2 font-mono text-neutral-900">{check.name.replace(/_/g, " ")}</td>
              <td className="px-4 py-2 text-center">
                <span className={check.passed ? "text-success-600" : "text-danger-600"}>
                  {check.passed ? "✓ PASS" : "✕ FAIL"}
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-500">{check.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
