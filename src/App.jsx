import { useEffect, useMemo, useState } from "react";
import {
  banManagedUser,
  deleteManagedUser,
  deleteManagedUsers,
  fetchAnalyticsSummary,
  fetchManagedUser,
  fetchManagedUsers,
  sendBroadcastNotification,
  fetchProfile,
  fetchTopUsers,
  getStoredUser,
  login,
  logout,
  unbanManagedUser,
  updateManagedUser,
} from "./api.js";

function formatCost(value) {
  const amount = Number(value || 0);
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds) {
  if (!seconds) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDateLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function NotificationComposer() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tier, setTier] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const send = async (event) => {
    event.preventDefault();
    const audience = tier ? `${tier} plan users` : "all users";
    if (!window.confirm(`Send this notification to ${audience}?`)) return;
    try {
      setSending(true);
      setError("");
      setResult("");
      const data = await sendBroadcastNotification({ title, body: message, tier });
      if (data?.status === "no_active_tokens") {
        setResult("No devices to send to yet (no one has registered for notifications).");
      } else {
        setResult(`Sent to ${data?.success ?? 0} device(s)${data?.failure ? `, ${data.failure} failed` : ""}.`);
        setTitle("");
        setMessage("");
      }
    } catch (err) {
      setError(err.message || "Failed to send notification.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Send push notification</h2>
      </div>
      <form className="user-search" onSubmit={send}>
        <label>
          <span>Title</span>
          <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>Message</span>
          <input value={message} maxLength={500} required onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label>
          <span>Audience</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All users</option>
            <option value="free">Free plan</option>
            <option value="plus">Plus plan</option>
            <option value="pro">Pro plan</option>
          </select>
        </label>
        <button className="primary" type="submit" disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
      {result && <p className="subtle">{result}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 411.71 424.29" xmlns="http://www.w3.org/2000/svg">
      <g>
        <path fill="#14b8a6" d="m312.91,424.29H0s0-197.61,0-197.61h312.91c54.57,0,98.81,44.24,98.81,98.81h0c0,54.57-44.24,98.81-98.81,98.81Z"/>
        <circle fill="#14b8a6" cx="282.22" cy="98.81" r="98.81"/>
        <rect fill="#14b8a6" x="0" y="0" width="148.32" height="197.61"/>
      </g>
    </svg>
  );
}

function MiniBarChart({ series, color = "#14b8a6", maxBars = 14 }) {
  // Only show the last maxBars data points to prevent overflow
  const displayData = series.length > maxBars ? series.slice(-maxBars) : series;
  const max = Math.max(...displayData.map((item) => item.count), 1);
  return (
    <div className="mini-chart">
      {displayData.map((item) => (
        <div
          key={item.date}
          className="mini-bar"
          style={{
            height: `${(item.count / max) * 100}%`,
            background: `linear-gradient(180deg, ${color}, #1f2937)`
          }}
          title={`${formatShortDate(item.date)}: ${item.count}`}
        />
      ))}
    </div>
  );
}

function DetailedChart({ series, color, label, onClose }) {
  const [visibleDays, setVisibleDays] = useState(14);

  if (!series || series.length === 0) return null;

  const total = series.reduce((sum, item) => sum + item.count, 0);
  const avg = series.length > 0 ? Math.round(total / series.length) : 0;

  // Find peak day
  const peak = series.reduce((maxItem, item) => item.count > maxItem.count ? item : maxItem, series[0]);

  // Get data in reverse chronological order (most recent first)
  const reversedData = [...series].reverse();
  const chartData = reversedData.slice(0, visibleDays);
  const max = Math.max(...chartData.map((item) => item.count), 1);
  const hasMoreData = series.length > visibleDays;

  const handleLoadMore = () => {
    setVisibleDays((prev) => Math.min(prev + 14, series.length));
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>{label}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="detail-stats">
          <div className="detail-stat">
            <p className="label">Total</p>
            <h3>{formatNumber(total)}</h3>
          </div>
          <div className="detail-stat">
            <p className="label">Daily Average</p>
            <h3>{formatNumber(avg)}</h3>
          </div>
          <div className="detail-stat">
            <p className="label">Peak Day</p>
            <h3>{formatShortDate(peak?.date)}</h3>
            <p className="subtle">{formatNumber(peak?.count)} events</p>
          </div>
        </div>

        <div className="detail-chart">
          <h4>Daily Breakdown ({visibleDays} of {series.length} days)</h4>
          <div className="detail-bars">
            {chartData.map((item) => {
              const width = (item.count / max) * 100;
              const showInside = width > 15;
              return (
                <div key={item.date} className="detail-bar-wrapper">
                  <span className="detail-bar-label">{formatShortDate(item.date)}</span>
                  <div className="detail-bar-container">
                    <div
                      className="detail-bar"
                      style={{
                        width: `${Math.max(width, 2)}%`,
                        background: color
                      }}
                    >
                      {showInside && (
                        <span className="detail-bar-value">{formatNumber(item.count)}</span>
                      )}
                    </div>
                    {!showInside && (
                      <span className="detail-bar-value outside">{formatNumber(item.count)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {hasMoreData && (
            <button className="load-more-btn" onClick={handleLoadMore}>
              Load More ({series.length - visibleDays} more days)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RetentionCohort({ retention }) {
  if (!retention) return null;

  const cohorts = [
    { key: "d1", label: "Day 1", value: retention.d1 },
    { key: "d7", label: "Day 7", value: retention.d7 },
    { key: "d30", label: "Day 30", value: retention.d30 },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>User Retention</h2>
        <p className="subtle">Percentage of users returning after signup</p>
      </div>
      <div className="retention-grid">
        {cohorts.map((cohort) => (
          <div key={cohort.key} className="retention-item">
            <p className="label">{cohort.label}</p>
            <h3 className={cohort.value >= 0.3 ? "good" : cohort.value >= 0.1 ? "warning" : "danger"}>
              {formatPercent(cohort.value)}
            </h3>
            <div className="retention-bar">
              <div
                className="retention-fill"
                style={{ width: `${(cohort.value || 0) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureSessionDurations({ durations }) {
  if (!durations || Object.keys(durations).length === 0) return null;

  const features = [
    { key: "chat_assistant", label: "Chat Assistant", icon: "chat" },
    { key: "ai_checker", label: "AI Checker", icon: "check" },
    { key: "quiz_generation", label: "Quiz Generation", icon: "quiz" },
    { key: "flashcard_generation", label: "Flashcard Generation", icon: "cards" },
    { key: "study_session", label: "Study Sessions", icon: "book" },
    { key: "mcq_review", label: "MCQ Review", icon: "review" },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Session Duration by Feature</h2>
        <p className="subtle">Average time users spend on each feature</p>
      </div>
      <div className="duration-grid">
        {features.map((feature) => {
          const duration = durations[feature.key];
          if (duration === undefined) return null;
          return (
            <div key={feature.key} className="duration-item">
              <p className="label">{feature.label}</p>
              <h3>{formatDuration(duration)}</h3>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TopUsersTable({ users, totalCount, filters, onShowAll }) {
  if (!users || users.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <div>
            <h2>Top Users by Engagement</h2>
            <p className="subtle">Most active users in the selected period</p>
          </div>
          {totalCount > 10 && (
            <button className="ghost" onClick={onShowAll}>
              Show All ({totalCount})
            </button>
          )}
        </div>
      </div>
      <div className="table compact">
        <div className="table-row table-head">
          <div>User</div>
          <div>Total Actions</div>
          <div>Sessions</div>
          <div>Quizzes</div>
          <div>Flashcards</div>
          <div>Chats</div>
        </div>
        {users.slice(0, 10).map((user, idx) => (
          <div className="table-row" key={user.user_id || idx}>
            <div>
              <strong>{user.email || `User ${idx + 1}`}</strong>
            </div>
            <div className="highlight">{formatNumber(user.total_actions)}</div>
            <div>{formatNumber(user.sessions)}</div>
            <div>{formatNumber(user.quizzes)}</div>
            <div>{formatNumber(user.flashcards)}</div>
            <div>{formatNumber(user.chats)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AllUsersModal({ filters, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 40,
    totalCount: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });

  const loadUsers = async (page = 1) => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchTopUsers({
        startDate: filters.startDate,
        endDate: filters.endDate,
        page,
        pageSize: 40,
      });
      setUsers(data.users || []);
      setPagination({
        page: data.pagination?.page || 1,
        pageSize: data.pagination?.page_size || 40,
        totalCount: data.pagination?.total_count || 0,
        totalPages: data.pagination?.total_pages || 1,
        hasNext: data.pagination?.has_next || false,
        hasPrev: data.pagination?.has_prev || false,
      });
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, [filters.startDate, filters.endDate]);

  const handlePrevPage = () => {
    if (pagination.hasPrev) {
      loadUsers(pagination.page - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination.hasNext) {
      loadUsers(pagination.page + 1);
    }
  };

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>All Users by Engagement</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {loading ? (
            <div className="loading-panel">
              <p>Loading users...</p>
            </div>
          ) : error ? (
            <div className="panel error">{error}</div>
          ) : (
            <>
              <div className="table compact">
                <div className="table-row table-head">
                  <div>User</div>
                  <div>Total Actions</div>
                  <div>Sessions</div>
                  <div>Quizzes</div>
                  <div>Flashcards</div>
                  <div>Chats</div>
                </div>
                {users.map((user, idx) => (
                  <div className="table-row" key={user.user_id || idx}>
                    <div>
                      <strong>{user.email || `User ${idx + 1}`}</strong>
                    </div>
                    <div className="highlight">{formatNumber(user.total_actions)}</div>
                    <div>{formatNumber(user.sessions)}</div>
                    <div>{formatNumber(user.quizzes)}</div>
                    <div>{formatNumber(user.flashcards)}</div>
                    <div>{formatNumber(user.chats)}</div>
                  </div>
                ))}
              </div>

              <div className="pagination">
                <button
                  className="ghost"
                  onClick={handlePrevPage}
                  disabled={!pagination.hasPrev}
                >
                  ← Previous
                </button>
                <span className="pagination-info">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} users)
                </span>
                <button
                  className="ghost"
                  onClick={handleNextPage}
                  disabled={!pagination.hasNext}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TopSubjectsTable({ subjects }) {
  if (!subjects || subjects.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Top Subjects by Engagement</h2>
        <p className="subtle">Most used subjects in the selected period</p>
      </div>
      <div className="table compact">
        <div className="table-row table-head">
          <div>Subject</div>
          <div>Total Usage</div>
          <div>Users</div>
          <div>Quizzes</div>
          <div>Flashcards</div>
          <div>Sessions</div>
        </div>
        {subjects.slice(0, 10).map((subject, idx) => (
          <div className="table-row" key={subject.subject_id || idx}>
            <div>
              <strong>{subject.name}</strong>
              {subject.code && <span className="subtle"> · {subject.code}</span>}
            </div>
            <div className="highlight">{formatNumber(subject.total_usage)}</div>
            <div>{formatNumber(subject.unique_users)}</div>
            <div>{formatNumber(subject.quizzes)}</div>
            <div>{formatNumber(subject.flashcards)}</div>
            <div>{formatNumber(subject.sessions)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConversionFunnel({ funnel }) {
  if (!funnel) return null;

  const steps = [
    { key: "signups", label: "Signups", color: "#14b8a6" },
    { key: "first_chat", label: "First Chat", color: "#0891b2" },
    { key: "quiz_generated", label: "Generated Quiz", color: "#6366f1" },
    { key: "quiz_completed", label: "Completed Quiz", color: "#8b5cf6" },
    { key: "retained_7d", label: "Retained (7d)", color: "#a855f7" },
  ];

  const maxValue = Math.max(...steps.map(s => funnel[s.key] || 0), 1);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Conversion Funnel</h2>
        <p className="subtle">User journey from signup to retention</p>
      </div>
      <div className="funnel">
        {steps.map((step, idx) => {
          const value = funnel[step.key] || 0;
          const prevValue = idx > 0 ? (funnel[steps[idx - 1].key] || 0) : value;
          const conversionRate = prevValue > 0 ? value / prevValue : 0;
          const width = (value / maxValue) * 100;

          return (
            <div key={step.key} className="funnel-step">
              <div className="funnel-info">
                <span className="funnel-label">{step.label}</span>
                <span className="funnel-value">{formatNumber(value)}</span>
                {idx > 0 && (
                  <span className="funnel-rate">{formatPercent(conversionRate)}</span>
                )}
              </div>
              <div className="funnel-bar-container">
                <div
                  className="funnel-bar"
                  style={{
                    width: `${width}%`,
                    background: step.color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UsersPage({ currentAdminId, onEditUser }) {
  const [users, setUsers] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [banningId, setBanningId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadUsers = async (nextPage = page, nextSearch = search) => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchManagedUsers({
        search: nextSearch,
        plan,
        startDate,
        endDate,
        page: nextPage,
        pageSize: 20,
      });
      setUsers(data.users || []);
      setPagination(data.pagination || null);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(page, search);
  }, [page, search, plan, startDate, endDate]);

  const handleSearch = (event) => {
    event.preventDefault();
    setNotice("");
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleFilterChange = () => {
    setNotice("");
    setPage(1);
  };

  const handleToggleBan = async (user) => {
    const banning = user.is_active;
    const confirmed = window.confirm(
      banning
        ? `Ban ${user.email}? They will be immediately signed out and unable to sign in.`
        : `Unban ${user.email}? They will be able to sign in again.`
    );
    if (!confirmed) return;

    try {
      setBanningId(user.id);
      setError("");
      setNotice("");
      if (banning) {
        await banManagedUser(user.id);
        setNotice(`${user.email} was banned.`);
      } else {
        await unbanManagedUser(user.id);
        setNotice(`${user.email} was unbanned.`);
      }
      await loadUsers(page, search);
    } catch (err) {
      setError(err.message || "Failed to update the user's ban status.");
    } finally {
      setBanningId(null);
    }
  };

  const handleDelete = async (user) => {
    const confirmed = window.confirm(
      `Permanently delete ${user.email} and all associated data? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(user.id);
      setError("");
      setNotice("");
      await deleteManagedUser(user.id);
      setNotice(`${user.email} was deleted successfully.`);
      if (users.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await loadUsers(page, search);
      }
    } catch (err) {
      setError(err.message || "Failed to delete user.");
    } finally {
      setDeletingId(null);
    }
  };

  const isProtected = (user) =>
    ["admin", "staff", "superadmin"].includes(
      String(user.role || "").toLowerCase()
    ) || Number(user.id) === Number(currentAdminId);

  const selectableUsers = users.filter((user) => !isProtected(user));
  const allSelectableSelected = selectableUsers.length > 0 &&
    selectableUsers.every((user) => selectedIds.has(user.id));

  const toggleUser = (userId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelectableSelected) {
        selectableUsers.forEach((user) => next.delete(user.id));
      } else {
        selectableUsers.forEach((user) => next.add(user.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const userIds = [...selectedIds];
    if (userIds.length === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${userIds.length} selected users and all associated data? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      setError("");
      setNotice("");
      const result = await deleteManagedUsers(userIds);
      setNotice(`${result.deleted_count || userIds.length} users were deleted successfully.`);
      await loadUsers(page, search);
    } catch (err) {
      setError(err.message || "Failed to delete the selected users.");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <section className="users-page">
      <NotificationComposer />
      <div className="panel users-toolbar">
        <form className="user-search" onSubmit={handleSearch}>
          <label>
            <span>Search users</span>
            <input
              type="search"
              placeholder="Email, username, or name"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">Search</button>
          {search && (
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </form>
        <div className="user-filters">
          <label>
            <span>Plan</span>
            <select
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value);
                handleFilterChange();
              }}
            >
              <option value="all">All plans</option>
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </select>
          </label>
          <label>
            <span>Joined from</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                handleFilterChange();
              }}
            />
          </label>
          <label>
            <span>Joined to</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                handleFilterChange();
              }}
            />
          </label>
          <button
            className="ghost"
            type="button"
            disabled={loading}
            onClick={() => loadUsers(page, search)}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {(plan !== "all" || startDate || endDate) && (
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setPlan("all");
                setStartDate("");
                setEndDate("");
                handleFilterChange();
              }}
            >
              Reset filters
            </button>
          )}
        </div>
        <div className="bulk-actions">
          <span className="subtle">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : pagination
                ? `${formatNumber(pagination.total_count)} registered users`
                : "Loading users"}
          </span>
          <button
            className="danger-button"
            type="button"
            disabled={selectedIds.size === 0 || bulkDeleting}
            onClick={handleBulkDelete}
          >
            {bulkDeleting ? "Deleting..." : `Delete selected${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </button>
        </div>
      </div>

      {notice && <div className="panel success-message">{notice}</div>}
      {error && <div className="panel error">{error}</div>}

      <div className="panel users-panel">
        {loading ? (
          <div className="loading-panel"><p>Loading users...</p></div>
        ) : users.length === 0 ? (
          <div className="empty-state">No users found.</div>
        ) : (
          <div className="table-scroll">
            <div className="users-table">
              <div className="user-row user-head">
                <div className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="Select all users on this page"
                    checked={allSelectableSelected}
                    onChange={toggleAll}
                    disabled={selectableUsers.length === 0 || bulkDeleting}
                  />
                </div>
                <div>User</div>
                <div>Role</div>
                <div>Provider</div>
                <div>Plan</div>
                <div>Status</div>
                <div>Joined</div>
                <div>Last login</div>
                <div>AI tokens</div>
                <div>Est. cost</div>
                <div>Actions</div>
              </div>
              {users.map((user) => {
                const isAdmin = ["admin", "staff", "superadmin"].includes(
                  String(user.role || "").toLowerCase()
                );
                const protectedUser = isProtected(user);
                const aiUsage = user.ai_usage || { total_tokens: 0, estimated_cost_usd: 0 };
                return (
                  <div className={`user-row ${selectedIds.has(user.id) ? "selected" : ""}`} key={user.id}>
                    <div className="selection-cell">
                      <input
                        type="checkbox"
                        aria-label={`Select ${user.email}`}
                        checked={selectedIds.has(user.id)}
                        disabled={protectedUser || bulkDeleting || deletingId === user.id}
                        onChange={() => toggleUser(user.id)}
                      />
                    </div>
                    <div className="user-identity">
                      <strong>{user.full_name || user.username || "Unnamed user"}</strong>
                      <span>{user.email}</span>
                    </div>
                    <div><span className={`badge ${isAdmin ? "admin" : ""}`}>{user.role}</span></div>
                    <div>{user.auth_provider || "email"}</div>
                    <div><span className={`badge ${user.effective_plan && user.effective_plan !== "free" ? "admin" : ""}`}>{user.effective_plan || "free"}</span></div>
                    <div>
                      <span className={`status-dot ${user.is_active && user.is_verified ? "active" : "inactive"}`} />
                      {user.is_active ? (user.is_verified ? "Active" : "Unverified") : "Banned"}
                    </div>
                    <div>{formatDateLabel(user.created_at)}</div>
                    <div>{formatDateTime(user.last_login)}</div>
                    <div>{formatNumber(aiUsage.total_tokens)}</div>
                    <div>{formatCost(aiUsage.estimated_cost_usd)}</div>
                    <div className="user-actions">
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => onEditUser(user.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        disabled={protectedUser || banningId === user.id}
                        title={protectedUser ? "Admin accounts are protected" : (user.is_active ? "Ban user" : "Unban user")}
                        onClick={() => handleToggleBan(user)}
                      >
                        {banningId === user.id
                          ? "Updating..."
                          : protectedUser
                            ? "Protected"
                            : user.is_active ? "Ban" : "Unban"}
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={protectedUser || bulkDeleting || deletingId === user.id}
                        title={protectedUser ? "Admin accounts are protected" : "Delete user"}
                        onClick={() => handleDelete(user)}
                      >
                        {deletingId === user.id ? "Deleting..." : protectedUser ? "Protected" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <div className="pagination">
            <button
              className="ghost"
              type="button"
              disabled={!pagination.has_prev || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              className="ghost"
              type="button"
              disabled={!pagination.has_next || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const blankEditForm = {
  username: "",
  email: "",
  full_name: "",
  age: "",
  class_level: "O",
  exam_board: "cambridge",
  is_active: true,
  is_verified: false,
  profile_completed: false,
  subscription_action: "unchanged",
  subscription_tier: "plus",
  grant_duration: "30",
  custom_expiry: "",
};

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function UserEditPage({ userId, currentAdminId, onBack }) {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(blankEditForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUser = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchManagedUser(userId);
      setUser(data);
      setForm({
        ...blankEditForm,
        username: data.username || "",
        email: data.email || "",
        full_name: data.profile?.full_name || "",
        age: data.profile?.age ?? "",
        class_level: data.profile?.class_level || "O",
        exam_board: data.profile?.exam_board || "cambridge",
        is_active: Boolean(data.is_active),
        is_verified: Boolean(data.is_verified),
        profile_completed: Boolean(data.profile_completed),
        subscription_tier: ["plus", "pro"].includes(data.subscription?.tier)
          ? data.subscription.tier
          : "plus",
        custom_expiry: dateInputValue(data.subscription?.expires_at),
      });
    } catch (err) {
      setError(err.message || "Failed to load user.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, [userId]);

  const setField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const calculateExpiry = () => {
    if (form.grant_duration === "lifetime") return null;
    if (form.grant_duration === "custom") {
      return form.custom_expiry
        ? new Date(`${form.custom_expiry}T23:59:59.999Z`).toISOString()
        : null;
    }
    const expiry = new Date();
    expiry.setUTCDate(expiry.getUTCDate() + Number(form.grant_duration));
    return expiry.toISOString();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      form.subscription_action === "grant" &&
      form.grant_duration === "custom" &&
      !form.custom_expiry
    ) {
      setError("Choose an expiry date for the custom premium grant.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");
      const updated = await updateManagedUser(userId, {
        username: form.username.trim(),
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        age: form.age === "" ? null : Number(form.age),
        class_level: form.class_level,
        exam_board: form.exam_board,
        is_active: form.is_active,
        is_verified: form.is_verified,
        profile_completed: form.profile_completed,
        subscription_action: form.subscription_action,
        subscription_tier: form.subscription_tier,
        subscription_expires_at:
          form.subscription_action === "grant" ? calculateExpiry() : null,
      });
      setUser(updated);
      setForm((current) => ({
        ...current,
        subscription_action: "unchanged",
        custom_expiry: dateInputValue(updated.subscription?.expires_at),
      }));
      setNotice("User details were updated successfully.");
    } catch (err) {
      const fieldErrors = err.payload?.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join(" ");
      setError(fieldErrors || err.message || "Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="panel loading-panel"><p>Loading user...</p></div>;
  }
  if (!user) {
    return (
      <section className="edit-user-page">
        <button className="ghost back-button" type="button" onClick={onBack}>← Back to users</button>
        <div className="panel error">{error || "User not found."}</div>
      </section>
    );
  }

  const subscription = user.subscription || {};
  const isStoreSubscription = subscription.store && subscription.store !== "promotional";
  const isOtherAdmin = ["admin", "staff", "superadmin"].includes(
    String(user.role || "").toLowerCase()
  ) && Number(user.id) !== Number(currentAdminId);

  return (
    <section className="edit-user-page">
      <button className="ghost back-button" type="button" onClick={onBack}>← Back to users</button>
      {notice && <div className="panel success-message">{notice}</div>}
      {error && <div className="panel error">{error}</div>}

      <form className="edit-user-form" onSubmit={handleSubmit}>
        <div className="panel form-section">
          <div className="panel-header">
            <div>
              <h2>Account details</h2>
              <p className="subtle">User #{user.id} · {user.role} · {user.auth_provider || "email"}</p>
            </div>
          </div>
          <div className="form-grid">
            <label><span>Full name</span><input required maxLength="100" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} /></label>
            <label><span>Username</span><input required maxLength="150" value={form.username} onChange={(e) => setField("username", e.target.value)} /></label>
            <label className="wide"><span>Email</span><input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></label>
            <label><span>Age</span><input type="number" min="1" max="120" value={form.age} onChange={(e) => setField("age", e.target.value)} /></label>
            <label><span>Class level</span><select value={form.class_level} onChange={(e) => setField("class_level", e.target.value)}><option value="O">O Level</option><option value="A">A Level</option></select></label>
            <label><span>Exam board</span><select value={form.exam_board} onChange={(e) => setField("exam_board", e.target.value)}><option value="cambridge">Cambridge</option><option value="edexcel">Edexcel</option><option value="aqa">AQA</option><option value="ocr">OCR</option><option value="wjec">WJEC</option></select></label>
          </div>
          <div className="checkbox-grid">
            <label><input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /> Account active</label>
            <label><input type="checkbox" checked={form.is_verified} onChange={(e) => setField("is_verified", e.target.checked)} /> Email verified</label>
            <label><input type="checkbox" checked={form.profile_completed} onChange={(e) => setField("profile_completed", e.target.checked)} /> Profile completed</label>
          </div>
        </div>

        <div className="panel form-section premium-section">
          <div className="panel-header subscription-header">
            <div>
              <h2>Premium access</h2>
              <p className="subtle">Grant or revoke promotional premium access.</p>
            </div>
            <span className={`premium-status ${subscription.is_active ? "active" : ""}`}>
              {subscription.is_active ? `${subscription.tier} active` : "Free"}
            </span>
          </div>
          <div className="subscription-summary">
            <div><span>Source</span><strong>{subscription.store || "None"}</strong></div>
            <div><span>Expires</span><strong>{subscription.expires_at ? formatDateTime(subscription.expires_at) : subscription.is_active ? "No expiry" : "—"}</strong></div>
            <div><span>Product</span><strong>{subscription.product_id || "—"}</strong></div>
          </div>
          {isStoreSubscription && (
            <p className="subscription-warning">This is a {subscription.store} subscription. It can be viewed here, but cancellation must be handled in RevenueCat.</p>
          )}
          <div className="form-grid premium-controls">
            <label><span>Premium action</span><select value={form.subscription_action} onChange={(e) => setField("subscription_action", e.target.value)}><option value="unchanged">Keep current access</option><option value="grant" disabled={isStoreSubscription}>Grant premium manually</option><option value="revoke" disabled={isStoreSubscription || !subscription.is_manual || !subscription.is_active}>Revoke manual grant</option></select></label>
            {form.subscription_action === "grant" && <>
              <label><span>Tier</span><select value={form.subscription_tier} onChange={(e) => setField("subscription_tier", e.target.value)}><option value="plus">Plus</option><option value="pro">Pro</option></select></label>
              <label><span>Duration</span><select value={form.grant_duration} onChange={(e) => setField("grant_duration", e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="lifetime">No expiry</option><option value="custom">Custom date</option></select></label>
              {form.grant_duration === "custom" && <label><span>Expires on</span><input required type="date" min={new Date().toISOString().slice(0, 10)} value={form.custom_expiry} onChange={(e) => setField("custom_expiry", e.target.value)} /></label>}
            </>}
          </div>
        </div>

        <div className="form-actions">
          <button className="ghost" type="button" onClick={onBack}>Cancel</button>
          <button className="primary" type="submit" disabled={saving || isOtherAdmin} title={isOtherAdmin ? "Other admin accounts are protected" : "Save changes"}>{saving ? "Saving..." : isOtherAdmin ? "Protected admin" : "Save changes"}</button>
        </div>
      </form>
    </section>
  );
}

function getDashboardRoute(pathname) {
  const editMatch = pathname.match(/^\/users\/(\d+)\/?$/);
  if (editMatch) return { page: "user-edit", userId: Number(editMatch[1]) };
  if (pathname === "/users" || pathname === "/users/") return { page: "users", userId: null };
  return { page: "analytics", userId: null };
}

export default function App() {
  const today = new Date();
  const endDefault = today.toISOString().slice(0, 10);
  const startDefault = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [filters, setFilters] = useState({
    startDate: startDefault,
    endDate: endDefault,
    subjectId: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [authUser, setAuthUser] = useState(getStoredUser());
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [selectedCard, setSelectedCard] = useState(null);
  const [showAllUsersModal, setShowAllUsersModal] = useState(false);
  const initialRoute = getDashboardRoute(window.location.pathname);
  const [currentPage, setCurrentPage] = useState(initialRoute.page);
  const [editingUserId, setEditingUserId] = useState(initialRoute.userId);

  useEffect(() => {
    const handlePopState = () => {
      const route = getDashboardRoute(window.location.pathname);
      setCurrentPage(route.page);
      setEditingUserId(route.userId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (page, userId = null) => {
    const path = page === "user-edit" ? `/users/${userId}` : page === "users" ? "/users" : "/";
    window.history.pushState({}, "", path);
    setCurrentPage(page);
    setEditingUserId(userId);
  };

  const loadSummary = async (nextFilters = filters) => {
    if (authStatus !== "authenticated") {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await fetchAnalyticsSummary(nextFilters);
      setSummary(data);
    } catch (err) {
      if (err.status === 401) {
        setAuthStatus("unauthenticated");
        setAuthUser(null);
        setError("Session expired. Please sign in again.");
        return;
      }
      if (err.status === 403) {
        setError("Your account does not have analytics access.");
        return;
      }
      setError(err.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedUser = getStoredUser();
      if (!storedUser) {
        setAuthStatus("unauthenticated");
        return;
      }
      try {
        const profile = await fetchProfile();
        setAuthUser(profile);
        setAuthStatus("authenticated");
      } catch (err) {
        setAuthStatus("unauthenticated");
      }
    };

    initAuth();
  }, []);

  const totals = summary?.totals || {};
  const timeseries = summary?.timeseries || {};
  const subjects = summary?.subjects || [];
  const bySubject = summary?.by_subject || [];
  const activeUsers = summary?.active_users || {};
  const retention = summary?.retention;
  const sessionDurations = summary?.session_durations;
  const topUsers = summary?.top_users;
  const topUsersTotal = summary?.top_users_total || 0;
  const topSubjects = summary?.top_subjects;
  const funnel = summary?.conversion_funnel;

  const cards = useMemo(
    () => [
      { key: "ai_quizzes_generated", label: "AI Quizzes", value: totals.ai_quizzes_generated, color: "#14b8a6" },
      { key: "ai_flashcards_generated", label: "AI Flashcards", value: totals.ai_flashcards_generated, color: "#0891b2" },
      { key: "chat_assistant_messages", label: "Chat Assistant", value: totals.chat_assistant_messages, color: "#6366f1" },
      { key: "ai_checker_evaluations", label: "AI Checker", value: totals.ai_checker_evaluations, color: "#8b5cf6" },
      { key: "mcq_wrong_review", label: "MCQ Review", value: totals.mcq_wrong_review, color: "#a855f7" },
      { key: "study_sessions_created", label: "Study Sessions", value: totals.study_sessions_created, color: "#ec4899" },
      { key: "quiz_attempts", label: "Quiz Attempts", value: totals.quiz_attempts, color: "#f43f5e" },
      { key: "flashcard_reviews", label: "Flashcard Reviews", value: totals.flashcard_reviews, color: "#f97316" },
    ],
    [totals]
  );

  const latestDau = activeUsers.dau?.[activeUsers.dau.length - 1]?.count || 0;
  const latestWau = activeUsers.wau?.[activeUsers.wau.length - 1]?.count || 0;
  const latestMau = activeUsers.mau?.[activeUsers.mau.length - 1]?.count || 0;

  useEffect(() => {
    if (authStatus === "authenticated") {
      loadSummary(filters);
    }
  }, [authStatus]);

  const handleApply = () => {
    loadSummary(filters);
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const user = await login(loginForm);
      setAuthUser(user);
      setAuthStatus("authenticated");
      await loadSummary(filters);
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setAuthStatus("unauthenticated");
    setAuthUser(null);
    setSummary(null);
    setError("");
  };

  const handleCardClick = (card) => {
    setSelectedCard(card);
  };

  const handleCloseDetail = () => {
    setSelectedCard(null);
  };

  if (authStatus === "checking") {
    return (
      <div className="login">
        <div className="login-card">
          <Logo size={48} />
          <p className="subtle" style={{ marginTop: 16 }}>Checking access...</p>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand">
            <Logo size={48} />
            <h1>Blackboard AI</h1>
          </div>
          <p className="subtle">Sign in with your admin credentials</p>
          <form className="login-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </label>
            {authError ? <div className="panel error">{authError}</div> : null}
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo size={36} />
          <div>
            <h1>{currentPage === "user-edit" ? "Edit User" : currentPage === "users" ? "User Management" : "Blackboard AI Analytics"}</h1>
            <p className="subtle">
              {currentPage === "user-edit"
                ? "Manage account details and premium access"
                : currentPage === "users"
                ? "View and manage registered accounts"
                : summary?.range
                ? `${formatDateLabel(summary.range.start)} - ${formatDateLabel(summary.range.end)}`
                : "Loading range"}
            </p>
          </div>
        </div>
        <div className="header-right">
          <nav className="dashboard-nav" aria-label="Dashboard navigation">
            <button
              type="button"
              className={currentPage === "analytics" ? "active" : ""}
              onClick={() => navigateTo("analytics")}
            >
              Analytics
            </button>
            <button
              type="button"
              className={["users", "user-edit"].includes(currentPage) ? "active" : ""}
              onClick={() => navigateTo("users")}
            >
              Users
            </button>
          </nav>
          <div className="user-chip">
            <span>{authUser?.email || "Admin"}</span>
            <button className="ghost" type="button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
          {currentPage === "analytics" && <div className="filters">
            <label>
              <span>Start</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, endDate: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Subject</span>
              <select
                value={filters.subjectId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, subjectId: event.target.value }))
                }
              >
                <option value="">All</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name} ({subject.code})
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" type="button" onClick={handleApply}>
              Apply
            </button>
          </div>}
        </div>
      </header>

      {currentPage === "users" ? (
        <UsersPage currentAdminId={authUser?.id} onEditUser={(userId) => navigateTo("user-edit", userId)} />
      ) : currentPage === "user-edit" ? (
        <UserEditPage userId={editingUserId} currentAdminId={authUser?.id} onBack={() => navigateTo("users")} />
      ) : loading ? (
        <div className="panel loading-panel">
          <Logo size={48} />
          <p>Loading analytics...</p>
        </div>
      ) : error ? (
        <div className="panel error">{error}</div>
      ) : (
        <>
          {/* KPI Cards */}
          <section className="grid">
            {cards.map((card) => (
              <div
                className="card clickable"
                key={card.key}
                onClick={() => handleCardClick(card)}
                title="Click for details"
              >
                <p className="label">{card.label}</p>
                <h3>{formatNumber(card.value)}</h3>
                <MiniBarChart series={timeseries[card.key] || []} color={card.color} />
                <span className="card-hint">Click for details</span>
              </div>
            ))}
          </section>

          {/* Detail Modal */}
          {selectedCard && (
            <DetailedChart
              series={timeseries[selectedCard.key] || []}
              color={selectedCard.color}
              label={selectedCard.label}
              onClose={handleCloseDetail}
            />
          )}

          {/* Active Users */}
          <section className="panel">
            <div className="panel-header">
              <h2>Active Users</h2>
              <p className="subtle">Daily / Weekly / Monthly active users</p>
            </div>
            <div className="active-grid">
              <div className="active-item">
                <p className="label">DAU</p>
                <h3>{formatNumber(latestDau)}</h3>
                <MiniBarChart series={activeUsers.dau || []} color="#14b8a6" />
              </div>
              <div className="active-item">
                <p className="label">WAU</p>
                <h3>{formatNumber(latestWau)}</h3>
                <MiniBarChart series={activeUsers.wau || []} color="#0891b2" />
              </div>
              <div className="active-item">
                <p className="label">MAU</p>
                <h3>{formatNumber(latestMau)}</h3>
                <MiniBarChart series={activeUsers.mau || []} color="#6366f1" />
              </div>
            </div>
          </section>

          {/* Retention Cohorts */}
          <RetentionCohort retention={retention} />

          {/* Conversion Funnel */}
          <ConversionFunnel funnel={funnel} />

          {/* Two-column layout for top users and subjects */}
          <div className="two-column">
            <TopUsersTable
              users={topUsers}
              totalCount={topUsersTotal}
              filters={filters}
              onShowAll={() => setShowAllUsersModal(true)}
            />
            <TopSubjectsTable subjects={topSubjects} />
          </div>

          {/* All Users Modal */}
          {showAllUsersModal && (
            <AllUsersModal
              filters={filters}
              onClose={() => setShowAllUsersModal(false)}
            />
          )}

          {/* Session Durations */}
          <FeatureSessionDurations durations={sessionDurations} />

          {/* Usage by Subject */}
          <section className="panel">
            <div className="panel-header">
              <h2>Usage by Subject</h2>
              <p className="subtle">AI feature usage split by subject</p>
            </div>
            <div className="table">
              <div className="table-row table-head">
                <div>Subject</div>
                <div>AI Quizzes</div>
                <div>AI Flashcards</div>
                <div>Chat Assistant</div>
                <div>AI Checker</div>
                <div>MCQ Review</div>
                <div>Study Sessions</div>
                <div>Quiz Attempts</div>
                <div>Flashcard Reviews</div>
              </div>
              {bySubject.map((row) => (
                <div className="table-row" key={row.subject_id ?? "general"}>
                  <div>
                    <strong>{row.subject_name || "General"}</strong>
                    {row.subject_code ? (
                      <span className="subtle"> · {row.subject_code}</span>
                    ) : null}
                  </div>
                  <div>{formatNumber(row.totals.ai_quizzes_generated)}</div>
                  <div>{formatNumber(row.totals.ai_flashcards_generated)}</div>
                  <div>{formatNumber(row.totals.chat_assistant_messages)}</div>
                  <div>{formatNumber(row.totals.ai_checker_evaluations)}</div>
                  <div>{formatNumber(row.totals.mcq_wrong_review)}</div>
                  <div>{formatNumber(row.totals.study_sessions_created)}</div>
                  <div>{formatNumber(row.totals.quiz_attempts)}</div>
                  <div>{formatNumber(row.totals.flashcard_reviews)}</div>
                </div>
              ))}
              {!bySubject.length ? (
                <div className="table-row empty">No subject data for this range.</div>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
