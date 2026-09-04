import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  AuditLogEntry,
} from "../types";

import {
  apiAudit,
} from "../services/api";

import Icon from "../components/Icon";

function formatEvent(
  event: string,
) {
  return event
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}

function getEventType(
  event: string,
) {
  const normalized =
    event.toUpperCase();

  if (
    normalized.includes("BLOCK") ||
    normalized.includes("DENY")
  ) {
    return "danger";
  }

  if (
    normalized.includes("PAYMENT") ||
    normalized.includes("ORDER")
  ) {
    return "payment";
  }

  if (
    normalized.includes("APPROV") ||
    normalized.includes("ALLOW")
  ) {
    return "success";
  }

  if (
    normalized.includes("RECOVER") ||
    normalized.includes("UNKNOWN")
  ) {
    return "warning";
  }

  return "normal";
}

function getEventLabel(
  event: string,
) {
  const type =
    getEventType(event);

  switch (type) {
    case "danger":
      return "BLOCKED";

    case "payment":
      return "PAYMENT";

    case "success":
      return "AUTHORIZED";

    case "warning":
      return "RECOVERY";

    default:
      return "SYSTEM";
  }
}

function getDetailsPreview(
  details: Record<string, unknown>,
) {
  const entries =
    Object.entries(details || {});

  if (!entries.length) {
    return "No additional details recorded.";
  }

  return entries
    .slice(0, 3)
    .map(
      ([key, value]) =>
        `${key}: ${
          typeof value === "string"
            ? value
            : JSON.stringify(value)
        }`,
    )
    .join(" · ");
}

export default function AuditLog() {
  const [logs, setLogs] =
    useState<AuditLogEntry[]>([]);

  const [query, setQuery] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [expandedId, setExpandedId] =
    useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result =
        await apiAudit(100);

      /*
       * Defensive guard:
       * the UI must never crash if the API
       * accidentally returns an unexpected shape.
       */
      setLogs(
        Array.isArray(result)
          ? result
          : [],
      );
    } catch (e) {
      setLogs([]);

      setError(
        e instanceof Error
          ? e.message
          : "Unable to load audit trail.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered =
    useMemo(() => {
      const normalizedQuery =
        query.trim().toLowerCase();

      if (!normalizedQuery) {
        return logs;
      }

      return logs.filter(
        (log) =>
          `${log.event} ${
            log.actionId ?? ""
          } ${JSON.stringify(
            log.details,
          )}`
            .toLowerCase()
            .includes(normalizedQuery),
      );
    }, [logs, query]);

  return (
    <section className="audit-page">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="audit-page-header">
        <div>
          <p className="eyebrow">
            AUDIT TRAIL
          </p>

          <h1>
            What happened
          </h1>

          <p className="audit-subtitle">
            Policy decisions, approvals,
            payments and recovery transitions
            recorded by AgentShield.
          </p>
        </div>

        <button
          className="audit-refresh-button"
          onClick={() => void load()}
          disabled={loading}
        >
          <Icon
            name="refresh"
            size={15}
          />

          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </div>

      {/* =====================================================
          SUMMARY
      ===================================================== */}

      <div className="audit-summary">
        <div className="audit-summary-card">
          <div className="audit-summary-icon">
            <Icon
              name="activity"
              size={17}
            />
          </div>

          <div>
            <span>
              RECORDED EVENTS
            </span>

            <strong>
              {logs.length}
            </strong>
          </div>
        </div>

        <div className="audit-summary-card">
          <div className="audit-summary-icon">
            <Icon
              name="search"
              size={17}
            />
          </div>

          <div>
            <span>
              MATCHING EVENTS
            </span>

            <strong>
              {filtered.length}
            </strong>
          </div>
        </div>

        <div className="audit-summary-card audit-summary-status">
          <span className="audit-live-dot" />

          <div>
            <span>
              AUDIT STATUS
            </span>

            <strong>
              {error
                ? "DEGRADED"
                : "OPERATIONAL"}
            </strong>
          </div>
        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div className="audit-error">
          <Icon
            name="x"
            size={15}
          />

          <div>
            <strong>
              Unable to load audit trail
            </strong>

            <span>
              {error}
            </span>
          </div>

          <button
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      )}

      {/* =====================================================
          TOOLBAR
      ===================================================== */}

      <div className="audit-toolbar-new">
        <div className="audit-search">
          <Icon
            name="search"
            size={15}
          />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search events, action IDs or details..."
          />

          {query && (
            <button
              className="audit-clear-search"
              onClick={() =>
                setQuery("")
              }
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="audit-results-count">
          <span />
          {filtered.length}{" "}
          {filtered.length === 1
            ? "event"
            : "events"}
        </div>
      </div>

      {/* =====================================================
          AUDIT LIST
      ===================================================== */}

      <div className="audit-surface-new">
        {loading ? (
          <div className="audit-loading">
            <div className="audit-spinner" />

            <strong>
              Loading audit trail
            </strong>

            <span>
              Fetching server-recorded events...
            </span>
          </div>
        ) : filtered.length ? (
          <div className="audit-list">
            {filtered.map(
              (log, index) => {
                const type =
                  getEventType(
                    log.event,
                  );

                const expanded =
                  expandedId ===
                  log._id;

                return (
                  <div
                    className={`audit-row ${expanded ? "expanded" : ""}`}
                    key={
                      log._id ||
                      `${log.event}-${index}`
                    }
                  >
                    {/* Timeline */}
                    <div className="audit-timeline">
                      <div
                        className={`audit-event-marker ${type}`}
                      />

                      {index <
                        filtered.length -
                          1 && (
                        <div className="audit-timeline-line" />
                      )}
                    </div>

                    {/* Main content */}
                    <div className="audit-event-content">
                      <div className="audit-event-top">
                        <div className="audit-event-title">
                          <strong>
                            {formatEvent(
                              log.event,
                            )}
                          </strong>

                          <span
                            className={`audit-event-badge ${type}`}
                          >
                            {getEventLabel(
                              log.event,
                            )}
                          </span>
                        </div>

                        <time>
                          {formatDate(
                            log.timestamp,
                          )}
                        </time>
                      </div>

                      <div className="audit-event-meta">
                        {log.actionId ? (
                          <span>
                            <b>
                              ACTION
                            </b>

                            <code>
                              {log.actionId}
                            </code>
                          </span>
                        ) : (
                          <span>
                            <b>
                              SOURCE
                            </b>

                            <span>
                              AgentShield
                              Server
                            </span>
                          </span>
                        )}

                        <span className="audit-detail-preview">
                          {getDetailsPreview(
                            log.details,
                          )}
                        </span>
                      </div>

                      <button
                        className="audit-expand-button"
                        onClick={() =>
                          setExpandedId(
                            expanded
                              ? null
                              : log._id,
                          )
                        }
                      >
                        {expanded
                          ? "Hide details"
                          : "View details"}

                        <span>
                          {expanded
                            ? "↑"
                            : "↓"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="audit-details">
                          <div className="audit-details-header">
                            <span>
                              EVENT DETAILS
                            </span>
                          </div>

                          <pre>
                            {JSON.stringify(
                              log.details ||
                                {},
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        ) : (
          <div className="audit-empty">
            <div className="audit-empty-icon">
              <Icon
                name="activity"
                size={22}
              />
            </div>

            <strong>
              {query
                ? "No matching events"
                : "No audit events yet"}
            </strong>

            <span>
              {query
                ? "Try a different search term."
                : "Important policy and payment decisions will appear here as the agent is used."}
            </span>

            {query && (
              <button
                onClick={() =>
                  setQuery("")
                }
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}