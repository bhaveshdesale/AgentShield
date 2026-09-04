import { useEffect, useState } from "react";

interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (showDetails) {
      timer = setTimeout(() => setShowDetails(false), 5000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showDetails]);

  const statusCode = (error as Error & { statusCode?: number }).statusCode;

  return (
    <div className="rounded-lg border border-danger-200 bg-danger-50 p-4">
      <div className="flex items-start gap-2">
        <span className="text-danger-500">✕</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-danger-800">
            {statusCode ? `Request failed (${statusCode})` : "Something went wrong"}
          </p>
          <p className="mt-0.5 text-xs text-danger-600">{error.message}</p>
          {showDetails && (
            <pre className="mt-1 whitespace-pre-wrap text-xs text-danger-600">
              {(error as Error & { stack?: string }).stack}
            </pre>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs underline text-danger-700 hover:text-danger-800"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-xs font-medium underline text-primary-700 hover:text-primary-800"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
