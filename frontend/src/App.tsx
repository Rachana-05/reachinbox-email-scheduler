import { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  Search,
  Plus,
  Upload,
  X,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  CalendarClock,
} from "lucide-react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5001";

const USER_ID = "1e9f717c-a1f4-429b-99ad-99aba7a7b5e5";
const SENDER_ID = "30f68a31-5e65-49e2-ac49-596810080275";

type Email = {
  id: string;
  campaign_id: string;
  sender_id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduled_at: string;
  sent_at: string | null;
  status: "scheduled" | "processing" | "sent" | "failed" | "cancelled";
  error_message: string | null;
  message_id: string | null;
  bull_job_id: string | null;
  created_at: string;
  updated_at: string;
};

function App() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delaySeconds, setDelaySeconds] = useState("2");
  const [hourlyLimit, setHourlyLimit] = useState("50");

  const [csvFileName, setCsvFileName] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const checkBackend = async () => {
    try {
      const response = await fetch(`${API_URL}/api/health`);

      if (!response.ok) {
        throw new Error("Backend unavailable");
      }

      return true;
    } catch (error) {
      console.error("Backend check failed:", error);
      return false;
    }
  };

  const loadEmails = async () => {
    try {
      let response: Response;

      if (search.trim()) {
        response = await fetch(
          `${API_URL}/api/emails/search?q=${encodeURIComponent(search)}`
        );
      } else {
        response = await fetch(`${API_URL}/api/emails/all`);
      }

      if (!response.ok) {
        throw new Error("Failed to load emails");
      }

      const data = await response.json();

      setEmails(data.emails || []);
    } catch (error) {
      console.error("Failed to load emails:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackend();
    loadEmails();
  }, [search]);

  // Live dashboard updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadEmails();
    }, 3000);

    return () => clearInterval(interval);
  }, [search]);

  const openCampaign = () => {
    setShowCampaignModal(true);
  };

  const closeCampaign = () => {
    if (scheduling) return;

    setShowCampaignModal(false);

    setRecipients([]);
    setSubject("");
    setBody("");
    setStartTime("");
    setDelaySeconds("2");
    setHourlyLimit("50");
    setCsvFileName("");
  };

  const handleCSVUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setCsvFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        try {
          const extractedEmails: string[] = [];

          for (const row of results.data as Record<string, unknown>[]) {
            const keys = Object.keys(row);

            // Prefer a column called email.
            const emailKey = keys.find(
              (key) => key.toLowerCase().trim() === "email"
            );

            if (emailKey) {
              const value = String(row[emailKey] || "").trim();

              if (value) {
                extractedEmails.push(value);
              }

              continue;
            }

            // Otherwise find any column containing "email".
            const emailColumn = keys.find((key) =>
              key.toLowerCase().includes("email")
            );

            if (emailColumn) {
              const value = String(row[emailColumn] || "").trim();

              if (value) {
                extractedEmails.push(value);
              }

              continue;
            }

            // Fallback: scan all cells.
            for (const key of keys) {
              const value = String(row[key] || "").trim();

              if (
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
              ) {
                extractedEmails.push(value);
                break;
              }
            }
          }

          // Validate and remove duplicates.
          const validEmails = extractedEmails
            .map((email) => email.trim())
            .filter((email) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            );

          const uniqueEmails = Array.from(
            new Set(validEmails)
          );

          setRecipients(uniqueEmails);
        } catch (error) {
          console.error("CSV parsing failed:", error);
          alert("Failed to parse CSV file.");
        }
      },

      error: (error) => {
        console.error("CSV error:", error);
        alert("Failed to read CSV file.");
      },
    });
  };

  const handleSchedule = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (recipients.length === 0) {
      alert("Please add at least one recipient.");
      return;
    }

    if (!subject.trim()) {
      alert("Please enter a subject.");
      return;
    }

    if (!body.trim()) {
      alert("Please enter an email body.");
      return;
    }

    if (!startTime) {
      alert("Please select a start time.");
      return;
    }

    const selectedTime = new Date(startTime);

    if (selectedTime <= new Date()) {
      alert("Start time must be in the future.");
      return;
    }

    const delay = Number(delaySeconds);
    const limit = Number(hourlyLimit);

    if (delay < 2) {
      alert("Minimum email delay must be 2 seconds.");
      return;
    }

    if (limit < 1) {
      alert("Hourly limit must be at least 1.");
      return;
    }

    setScheduling(true);

    try {
      const backendAvailable = await checkBackend();

      if (!backendAvailable) {
        throw new Error(
          "Backend is not available. Please make sure the backend is running."
        );
      }

      const response = await fetch(
        `${API_URL}/api/emails/schedule`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            userId: USER_ID,
            senderId: SENDER_ID,
            recipients,
            subject: subject.trim(),
            body: body.trim(),
            startTime: selectedTime.toISOString(),
            delaySeconds: delay,
            hourlyLimit: limit,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to schedule campaign"
        );
      }

      alert(
        `Campaign scheduled successfully for ${recipients.length} recipient(s).`
      );

      closeCampaign();

      await loadEmails();
    } catch (error) {
      console.error("Schedule error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to schedule campaign."
      );
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelEmail = async (emailId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this scheduled email?"
    );

    if (!confirmed) return;

    setCancellingId(emailId);

    try {
      const response = await fetch(
        `${API_URL}/api/emails/${emailId}/cancel`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to cancel email"
        );
      }

      alert("Email cancelled successfully.");

      await loadEmails();
    } catch (error) {
      console.error("Cancel error:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to cancel email."
      );
    } finally {
      setCancellingId(null);
    }
  };

  const total = emails.length;

  const scheduled = emails.filter(
    (email) => email.status === "scheduled"
  ).length;

  const processing = emails.filter(
    (email) => email.status === "processing"
  ).length;

  const sent = emails.filter(
    (email) => email.status === "sent"
  ).length;

  const failed = emails.filter(
    (email) => email.status === "failed"
  ).length;

  const cancelled = emails.filter(
    (email) => email.status === "cancelled"
  ).length;

  const formatDate = (date: string | null) => {
    if (!date) return "-";

    return new Date(date).toLocaleString();
  };

  const getStatusClass = (status: Email["status"]) => {
    switch (status) {
      case "scheduled":
        return "status scheduled";

      case "processing":
        return "status processing";

      case "sent":
        return "status sent";

      case "failed":
        return "status failed";

      case "cancelled":
        return "status cancelled";

      default:
        return "status";
    }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <Mail size={22} />
          </div>

          <div>
            <h2>ReachInbox</h2>
            <span>Email Scheduler</span>
          </div>
        </div>

        <nav>
          <div className="nav-item active">
            <Mail size={18} />
            <span>Emails</span>
          </div>

          <div className="nav-item">
            <CalendarClock size={18} />
            <span>Campaigns</span>
          </div>
        </nav>
      </aside>

      {/* Main */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>Email Dashboard</h1>
            <p>
              Schedule, monitor and manage your email campaigns.
            </p>
          </div>

          <button
            className="new-campaign-button"
            onClick={openCampaign}
          >
            <Plus size={18} />
            New Campaign
          </button>
        </header>

        {/* Stats */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <Mail size={20} />
            </div>

            <div>
              <span>Total Emails</span>
              <strong>{total}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Clock size={20} />
            </div>

            <div>
              <span>Scheduled</span>
              <strong>{scheduled}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Loader2 size={20} />
            </div>

            <div>
              <span>Processing</span>
              <strong>{processing}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <CheckCircle size={20} />
            </div>

            <div>
              <span>Sent</span>
              <strong>{sent}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <XCircle size={20} />
            </div>

            <div>
              <span>Failed</span>
              <strong>{failed}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <X size={20} />
            </div>

            <div>
              <span>Cancelled</span>
              <strong>{cancelled}</strong>
            </div>
          </div>
        </section>

        {/* Search */}
        <section className="toolbar">
          <div className="search-box">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search emails, recipients or subjects..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>
        </section>

        {/* Email Table */}
        <section className="table-card">
          <div className="table-header">
            <div>
              <h2>Email Activity</h2>
              <span>
                Dashboard automatically refreshes every 3 seconds.
              </span>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <Loader2 className="spin" size={28} />
              <p>Loading emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="empty-state">
              <Mail size={36} />
              <h3>No emails found</h3>
              <p>
                Schedule your first campaign to see email activity
                here.
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Scheduled At</th>
                    <th>Sent At</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {emails.map((email) => (
                    <tr key={email.id}>
                      <td>
                        <div className="recipient-cell">
                          <div className="recipient-avatar">
                            {email.recipient
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <span>{email.recipient}</span>
                        </div>
                      </td>

                      <td>
                        <div className="subject-cell">
                          <strong>{email.subject}</strong>

                          {email.error_message && (
                            <small>
                              {email.error_message}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={getStatusClass(
                            email.status
                          )}
                        >
                          {email.status}
                        </span>
                      </td>

                      <td>
                        {formatDate(email.scheduled_at)}
                      </td>

                      <td>
                        {formatDate(email.sent_at)}
                      </td>

                      <td>
                        {email.status === "scheduled" ? (
                          <button
                            className="cancel-button"
                            disabled={
                              cancellingId === email.id
                            }
                            onClick={() =>
                              handleCancelEmail(email.id)
                            }
                          >
                            {cancellingId === email.id ? (
                              <>
                                <Loader2
                                  size={14}
                                  className="spin"
                                />
                                Cancelling...
                              </>
                            ) : (
                              "Cancel"
                            )}
                          </button>
                        ) : (
                          <span className="no-action">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Campaign Modal */}
      {showCampaignModal && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCampaign();
            }
          }}
        >
          <div className="campaign-modal">
            <div className="modal-header">
              <div>
                <h2>Create Campaign</h2>
                <p>
                  Schedule emails for your recipients.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={closeCampaign}
                disabled={scheduling}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSchedule}>
              {/* CSV */}
              <div className="form-group csv-upload-section">
                <label>Recipients</label>

                <div className="upload-box">
                  <Upload size={20} />

                  <div>
                    <strong>
                      Upload recipient CSV
                    </strong>

                    <p>
                      CSV should contain an email column.
                    </p>
                  </div>

                  <label className="upload-button">
                    Choose CSV

                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCSVUpload}
                      hidden
                    />
                  </label>
                </div>

                {csvFileName && (
                  <div className="csv-file">
                    <span>📄 {csvFileName}</span>

                    <span>
                      {recipients.length} recipient
                      {recipients.length !== 1
                        ? "s"
                        : ""}
                    </span>
                  </div>
                )}

                {recipients.length > 0 && (
                  <div className="recipient-count">
                    {recipients.length} unique recipient
                    {recipients.length !== 1
                      ? "s"
                      : ""}{" "}
                    loaded
                  </div>
                )}
              </div>

              {/* Manual recipients */}
              <div className="form-group">
                <label>
                  Or enter recipients manually
                </label>

                <textarea
                  value={recipients.join(", ")}
                  onChange={(event) => {
                    const values = event.target.value
                      .split(/[,\n]/)
                      .map((email) => email.trim())
                      .filter(Boolean);

                    setRecipients(
                      Array.from(new Set(values))
                    );
                  }}
                  placeholder="email@example.com, another@example.com"
                  rows={3}
                />
              </div>

              {/* Subject */}
              <div className="form-group">
                <label>Subject</label>

                <input
                  type="text"
                  value={subject}
                  onChange={(event) =>
                    setSubject(event.target.value)
                  }
                  placeholder="Enter email subject"
                />
              </div>

              {/* Body */}
              <div className="form-group">
                <label>Email Body</label>

                <textarea
                  value={body}
                  onChange={(event) =>
                    setBody(event.target.value)
                  }
                  placeholder="Write your email..."
                  rows={7}
                />
              </div>

              {/* Schedule */}
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>

                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(event) =>
                      setStartTime(event.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Delay Between Emails (seconds)</label>

                  <input
                    type="number"
                    min="2"
                    value={delaySeconds}
                    onChange={(event) =>
                      setDelaySeconds(event.target.value)
                    }
                  />
                </div>
              </div>

              {/* Rate limit */}
              <div className="form-group">
                <label>Hourly Email Limit</label>

                <input
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(event) =>
                    setHourlyLimit(event.target.value)
                  }
                />

                <small>
                  Maximum emails allowed from this sender
                  per hour.
                </small>
              </div>

              {/* Actions */}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeCampaign}
                  disabled={scheduling}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={scheduling}
                >
                  {scheduling ? (
                    <>
                      <Loader2
                        size={17}
                        className="spin"
                      />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <CalendarClock size={17} />
                      Schedule Campaign
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;