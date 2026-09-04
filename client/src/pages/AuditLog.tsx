import { useApi } from "../hooks/useApi";
import { apiGetAuditLogs } from "../services/api";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";

export default function AuditLog() {
  const { data: logs, error, loading, refetch } = useApi<any[]>(
    { fn: () => apiGetAuditLogs(50), deps: [] }
  );

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={refetch} />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Audit Log</h1>
      <p className="mt-1 text-neutral-500">View system events and actions.</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Timestamp</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Event</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Action ID</th>
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs && logs.length > 0 ? (
              logs.map((log: { _id: string; timestamp: string; event: string; actionId?: string; details: Record<string, unknown> }) => (
                <tr key={log._id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-900">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={log.event} />
                  </td>
                  <td className="px-4 py-2 font-mono text-neutral-900">{log.actionId || "N/A"}</td>
                  <td className="px-4 py-2 text-neutral-500">{JSON.stringify(log.details, null, 2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  No audit logs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}