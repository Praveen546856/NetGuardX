import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

const TARGETS = [
  { name: "Default Gateway", ip: "10.21.28.10", type: "Gateway" },
  { name: "Cloudflare DNS", ip: "1.1.1.1", type: "DNS Server" },
  { name: "Google DNS", ip: "8.8.8.8", type: "DNS Server" },
];

const CHART_COLORS = ["#2dd4bf", "#a78bfa", "#60a5fa"];

function getRecords(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    for (const key of [
      "records",
      "metrics",
      "history",
      "devices",
      "data",
    ]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }

  return [];
}

function getNumber(record, keys) {
  for (const key of keys) {
    const raw = record?.[key];

    if (raw !== undefined && raw !== null && raw !== "") {
      const value = Number(raw);

      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

function getDeviceName(record) {
  return String(
    record?.device_name ??
      record?.device ??
      record?.name ??
      ""
  ).toLowerCase();
}

function getDeviceIP(record) {
  return String(record?.ip_address ?? record?.ip ?? "");
}

function getLatestRecords(records) {
  const latest = new Map();

  for (const record of records) {
    const key = getDeviceIP(record) || getDeviceName(record);

    if (!key) continue;

    const previous = latest.get(key);

    if (
      !previous ||
      String(record.timestamp ?? "") >=
        String(previous.timestamp ?? "")
    ) {
      latest.set(key, record);
    }
  }

  return [...latest.values()];
}

function formatLatency(value) {
  return value === null || value === undefined
    ? "—"
    : `${Number(value).toFixed(2)} ms`;
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString();
}

function DeviceCard({ target, record }) {
  const status = String(
    record?.status ?? "UNKNOWN"
  ).toUpperCase();

  const latency = getNumber(record, [
    "avg_latency_ms",
    "average_latency",
    "latency_ms",
    "latency",
  ]);

  const packetLoss = getNumber(record, [
    "packet_loss_percent",
    "packet_loss",
    "loss_percent",
  ]);

  const received = getNumber(record, ["packets_received"]);
  const sent = getNumber(record, ["packets_sent"]);

  const statusClass =
    status === "ONLINE" && packetLoss > 0
      ? "partial"
      : status.toLowerCase();

  return (
    <article className="device-card">
      <div className="device-card-top">
        <div className="device-icon">
          {target.type === "Gateway" ? "⇄" : "⌘"}
        </div>

        <span className={`status-badge ${statusClass}`}>
          <span className="status-dot" />

          {status === "ONLINE" && packetLoss > 0
            ? "PARTIAL LOSS"
            : status}
        </span>
      </div>

      <h3>{target.name}</h3>

      <p className="device-ip">{target.ip}</p>

      <div className="device-divider" />

      <div className="device-metrics">
        <div>
          <span>Latency</span>
          <strong>{formatLatency(latency)}</strong>
        </div>

        <div>
          <span>Packet loss</span>
          <strong>
            {packetLoss === null ? "—" : `${packetLoss}%`}
          </strong>
        </div>
      </div>

      <div className="device-footer">
        <span>{target.type}</span>

        <span>
          {received !== null && sent !== null
            ? `${received}/${sent} packets received`
            : "Awaiting measurements"}
        </span>
      </div>
    </article>
  );
}

function AlertItem({ alert }) {
  return (
    <article className={`network-alert ${alert.severity}`}>
      <span className="alert-symbol">
        {alert.severity === "critical" ? "!" : "⚠"}
      </span>

      <div>
        <strong>
          {alert.severity === "critical"
            ? "CRITICAL"
            : "WARNING"}
        </strong>

        <p>{alert.message}</p>
      </div>
    </article>
  );
}

function App() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function fetchDashboard() {
    try {
      const [
        healthResponse,
        metricsResponse,
        historyResponse,
      ] = await Promise.all([
        fetch(`${API_BASE}/api/health`),
        fetch(`${API_BASE}/api/metrics`),
        fetch(`${API_BASE}/api/history`),
      ]);

      if (
        !healthResponse.ok ||
        !metricsResponse.ok ||
        !historyResponse.ok
      ) {
        throw new Error(
          "One or more API endpoints returned an error."
        );
      }

      const [healthData, metricsData, historyData] =
        await Promise.all([
          healthResponse.json(),
          metricsResponse.json(),
          historyResponse.json(),
        ]);

      setHealth(healthData);
      setMetrics(getRecords(metricsData));
      setHistory(getRecords(historyData));
      setLastUpdated(new Date());
      setError("");
    } catch {
      setError(
        "Cannot connect to the backend. Check whether FastAPI is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();

    const interval = setInterval(fetchDashboard, 5000);

    return () => clearInterval(interval);
  }, []);

  const latestRecords = getLatestRecords([
    ...metrics,
    ...history,
  ]);

  function findRecord(target) {
    return (
      latestRecords.find(
        (record) =>
          getDeviceIP(record) === target.ip ||
          getDeviceName(record).includes(
            target.name.toLowerCase()
          )
      ) ?? null
    );
  }

  const deviceRecords = TARGETS.map((target) => ({
    target,
    record: findRecord(target),
  }));

  const onlineCount = deviceRecords.filter(
    ({ record }) =>
      String(record?.status ?? "").toUpperCase() === "ONLINE"
  ).length;

  const offlineCount = deviceRecords.filter(
    ({ record }) =>
      String(record?.status ?? "").toUpperCase() === "OFFLINE"
  ).length;

  const averageLatencies = deviceRecords
    .map(({ record }) =>
      getNumber(record, [
        "avg_latency_ms",
        "average_latency",
        "latency_ms",
        "latency",
      ])
    )
    .filter((value) => value !== null);

  const averageLatency = averageLatencies.length
    ? averageLatencies.reduce(
        (sum, value) => sum + value,
        0
      ) / averageLatencies.length
    : null;

  const totalPacketLoss = deviceRecords
    .map(({ record }) =>
      getNumber(record, [
        "packet_loss_percent",
        "packet_loss",
        "loss_percent",
      ])
    )
    .filter((value) => value !== null);

  const averagePacketLoss = totalPacketLoss.length
    ? totalPacketLoss.reduce(
        (sum, value) => sum + value,
        0
      ) / totalPacketLoss.length
    : null;

  const recentHistory = [...history]
    .sort((a, b) =>
      String(b.timestamp ?? "").localeCompare(
        String(a.timestamp ?? "")
      )
    )
    .slice(0, 10);

  // Prepare data for latency and packet-loss charts.
  const chartRecords = [...history]
    .filter((record) => record.timestamp)
    .sort((a, b) =>
      String(a.timestamp).localeCompare(
        String(b.timestamp)
      )
    )
    .slice(-90);

  const chartDataByTimestamp = new Map();

  chartRecords.forEach((record) => {
    const timestamp = String(record.timestamp);

    if (!chartDataByTimestamp.has(timestamp)) {
      chartDataByTimestamp.set(timestamp, {
        timestamp,
        time: formatTime(timestamp),
      });
    }

    const point = chartDataByTimestamp.get(timestamp);

    const deviceIndex = TARGETS.findIndex(
      (target) =>
        getDeviceIP(record) === target.ip ||
        getDeviceName(record).includes(
          target.name.toLowerCase()
        )
    );

    if (deviceIndex >= 0) {
      point[`latency_${deviceIndex}`] = getNumber(
        record,
        [
          "avg_latency_ms",
          "average_latency",
          "latency_ms",
          "latency",
        ]
      );

      point[`loss_${deviceIndex}`] = getNumber(
        record,
        [
          "packet_loss_percent",
          "packet_loss",
          "loss_percent",
        ]
      );
    }
  });

  const chartData = [
    ...chartDataByTimestamp.values(),
  ];

  // Generate alerts based on the latest device measurements.
  const networkAlerts = deviceRecords
    .map(({ target, record }) => {
      if (!record) return null;

      const latency = getNumber(record, [
        "avg_latency_ms",
        "average_latency",
        "latency_ms",
        "latency",
      ]);

      const packetLoss =
        getNumber(record, [
          "packet_loss_percent",
          "packet_loss",
          "loss_percent",
        ]) ?? 0;

      const status = String(
        record.status ?? ""
      ).toUpperCase();

      if (status === "OFFLINE" || status === "DOWN") {
        return {
          device: target.name,
          severity: "critical",
          message: `${target.name} is offline`,
        };
      }

      if (packetLoss >= 20) {
        return {
          device: target.name,
          severity: "critical",
          message: `${target.name} has ${packetLoss}% packet loss`,
        };
      }

      if (packetLoss > 0) {
        return {
          device: target.name,
          severity: "warning",
          message: `${target.name} has ${packetLoss}% packet loss`,
        };
      }

      if (latency !== null && latency > 150) {
        return {
          device: target.name,
          severity: "warning",
          message: `${target.name} latency is high (${latency.toFixed(2)} ms)`,
        };
      }

      return null;
    })
    .filter(Boolean);

  const apiHealthy = [
    "ok",
    "healthy",
    "success",
  ].includes(
    String(health?.status ?? "").toLowerCase()
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">N</div>

          <div>
            <h2>NetGuardX</h2>
            <span>NETWORK INTELLIGENCE</span>
          </div>
        </div>

        <div className="sidebar-label">
          MONITORING
        </div>

        <nav className="sidebar-nav">
          <a
            className="nav-item active"
            href="#overview"
          >
            <span>▦</span> Overview
          </a>

          <a className="nav-item" href="#devices">
            <span>⌘</span> Devices
          </a>

          <a className="nav-item" href="#trends">
            <span>◷</span> Performance Trends
          </a>

          <a className="nav-item" href="#alerts">
            <span>⚠</span> Network Alerts
          </a>

          <a className="nav-item" href="#history">
            <span>◷</span> Network History
          </a>
        </nav>

        <div className="sidebar-label tools-label">
          SYSTEM
        </div>

        <div className="sidebar-system">
          <div
            className={`system-indicator ${
              error ? "offline" : ""
            }`}
          />

          <div>
            <strong>Monitoring Engine</strong>
            <span>
              {error
                ? "Connection issue"
                : "Auto-refresh enabled"}
            </span>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="avatar">NG</div>

          <div>
            <strong>NetGuardX</strong>
            <span>Network Administrator</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Dashboard <span>/</span> Overview
            </div>

            <h1>Network Overview</h1>

            <p className="page-subtitle">
              Real-time visibility into your network infrastructure.
            </p>
          </div>

          <div className="topbar-right">
            <div className="live-indicator">
              <span /> LIVE MONITORING
            </div>

            <button
              className="refresh-button"
              onClick={() => {
                setLoading(true);
                fetchDashboard();
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="alert-banner">
            <strong>Backend connection error</strong>
            <span>{error}</span>

            <button onClick={fetchDashboard}>
              Retry
            </button>
          </div>
        )}

        <section className="summary-grid">
          <article className="summary-card">
            <div className="summary-heading">
              <span>Total Devices</span>
              <span className="summary-icon blue">⌘</span>
            </div>

            <div className="summary-value">
              {TARGETS.length}
            </div>

            <div className="summary-description">
              Configured monitoring targets
            </div>
          </article>

          <article className="summary-card">
            <div className="summary-heading">
              <span>Devices Online</span>
              <span className="summary-icon green">✓</span>
            </div>

            <div className="summary-value">
              {onlineCount}
            </div>

            <div className="summary-description">
              Responding to monitoring probes
            </div>
          </article>

          <article className="summary-card">
            <div className="summary-heading">
              <span>Average Latency</span>
              <span className="summary-icon purple">◷</span>
            </div>

            <div className="summary-value">
              {formatLatency(averageLatency)}
            </div>

            <div className="summary-description">
              Across available device measurements
            </div>
          </article>

          <article className="summary-card">
            <div className="summary-heading">
              <span>Average Packet Loss</span>
              <span className="summary-icon orange">↘</span>
            </div>

            <div className="summary-value">
              {averagePacketLoss === null
                ? "—"
                : `${averagePacketLoss.toFixed(2)}%`}
            </div>

            <div className="summary-description">
              {offlineCount} device(s) reported offline
            </div>
          </article>
        </section>

        <section
          className="section-block"
          id="trends"
        >
          <div className="section-heading">
            <div>
              <h2>Performance Trends</h2>
              <p>
                Latency and packet-loss measurements from recent monitoring checks.
              </p>
            </div>

            <span className="section-count">
              AUTO-REFRESH · 5 SEC
            </span>
          </div>

          <div className="charts-grid">
            <article className="chart-card">
              <div className="chart-card-heading">
                <span>Latency Trend</span>
                <span className="summary-icon purple">◷</span>
              </div>

              {chartData.length ? (
                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 12,
                      right: 12,
                      left: 0,
                      bottom: 4,
                    }}
                  >
                    <CartesianGrid
                      stroke="#26334d"
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      dataKey="time"
                      tick={{
                        fill: "#8fa4c8",
                        fontSize: 11,
                      }}
                      minTickGap={30}
                    />

                    <YAxis
                      tick={{
                        fill: "#8fa4c8",
                        fontSize: 11,
                      }}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#111b2e",
                        border: "1px solid #293954",
                        borderRadius: 8,
                      }}
                    />

                    <Legend />

                    {TARGETS.map((target, index) => (
                      <Line
                        key={target.ip}
                        type="monotone"
                        dataKey={`latency_${index}`}
                        name={target.name}
                        stroke={CHART_COLORS[index]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">
                  Waiting for network history data…
                </p>
              )}
            </article>

            <article className="chart-card">
              <div className="chart-card-heading">
                <span>Packet Loss Trend</span>
                <span className="summary-icon orange">↘</span>
              </div>

              {chartData.length ? (
                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 12,
                      right: 12,
                      left: 0,
                      bottom: 4,
                    }}
                  >
                    <CartesianGrid
                      stroke="#26334d"
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      dataKey="time"
                      tick={{
                        fill: "#8fa4c8",
                        fontSize: 11,
                      }}
                      minTickGap={30}
                    />

                    <YAxis
                      tick={{
                        fill: "#8fa4c8",
                        fontSize: 11,
                      }}
                    />

                    <Tooltip
                      contentStyle={{
                        background: "#111b2e",
                        border: "1px solid #293954",
                        borderRadius: 8,
                      }}
                    />

                    <Legend />

                    {TARGETS.map((target, index) => (
                      <Line
                        key={target.ip}
                        type="monotone"
                        dataKey={`loss_${index}`}
                        name={target.name}
                        stroke={CHART_COLORS[index]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="chart-empty">
                  Waiting for network history data…
                </p>
              )}
            </article>
          </div>
        </section>

        <section
          className="section-block"
          id="alerts"
        >
          <div className="section-heading">
            <div>
              <h2>Network Alerts</h2>
              <p>
                Warnings for offline devices, packet loss, and high latency.
              </p>
            </div>

            <span className="section-count">
              {networkAlerts.length} ACTIVE
            </span>
          </div>

          <div className="alerts-list">
            {networkAlerts.length ? (
              networkAlerts.map((alert, index) => (
                <AlertItem
                  key={`${alert.device}-${index}`}
                  alert={alert}
                />
              ))
            ) : (
              <div className="no-alerts">
                <span className="healthy-check">✓</span>

                <div>
                  <strong>All clear</strong>
                  <p>
                    No high-latency or packet-loss alerts detected in the latest measurements.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section
          className="section-block"
          id="devices"
        >
          <div className="section-heading">
            <div>
              <h2>Monitored Devices</h2>
              <p>
                Health and performance of your network targets.
              </p>
            </div>

            <span className="section-count">
              {TARGETS.length} TARGETS
            </span>
          </div>

          <div className="device-grid">
            {deviceRecords.map(({ target, record }) => (
              <DeviceCard
                key={target.ip}
                target={target}
                record={record}
              />
            ))}
          </div>
        </section>

        <section
          className="section-block"
          id="history"
        >
          <div className="section-heading">
            <div>
              <h2>Network Activity</h2>
              <p>
                Latest measurements collected by the backend.
              </p>
            </div>

            <span className="section-count">
              LAST 10 RECORDS
            </span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Device</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Packet Loss</th>
                </tr>
              </thead>

              <tbody>
                {recentHistory.map((record, index) => {
                  const status = String(
                    record.status ?? "UNKNOWN"
                  ).toUpperCase();

                  const latency = getNumber(record, [
                    "avg_latency_ms",
                    "average_latency",
                    "latency_ms",
                    "latency",
                  ]);

                  const loss = getNumber(record, [
                    "packet_loss_percent",
                    "packet_loss",
                    "loss_percent",
                  ]);

                  return (
                    <tr
                      key={`${record.timestamp}-${record.device_name ?? record.ip_address ?? index}`}
                    >
                      <td>
                        {formatTime(record.timestamp)}
                      </td>

                      <td className="table-device">
                        {record.device_name ??
                          record.device ??
                          "Unknown device"}
                      </td>

                      <td>
                        {record.ip_address ??
                          record.ip ??
                          "—"}
                      </td>

                      <td>
                        <span
                          className={`status-badge ${status.toLowerCase()}`}
                        >
                          <span className="status-dot" />
                          {status}
                        </span>
                      </td>

                      <td>{formatLatency(latency)}</td>

                      <td>
                        {loss === null ? "—" : `${loss}%`}
                      </td>
                    </tr>
                  );
                })}

                {recentHistory.length === 0 && (
                  <tr>
                    <td
                      colSpan="6"
                      className="empty-state"
                    >
                      {loading
                        ? "Loading network history..."
                        : "No history records returned by the API."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>
            NetGuardX · Network Monitoring Dashboard
          </span>

          <span>
            API: {error ? "Disconnected" : "Checking"} ·{" "}
            {apiHealthy ? "Healthy" : "Health unconfirmed"}
          </span>

          <span>
            Last updated:{" "}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString()
              : "Not yet updated"}
          </span>
        </footer>
      </main>
    </div>
  );
}

export default App;