import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  BedDouble,
  ClipboardList,
  CreditCard,
  Wrench,
  UserRound,
  Search,
  Bell,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  Download,
  RefreshCw,
  Eye,
  X,
  AlertCircle,
  Database,
  LoaderCircle,
  ChevronDown,
  Menu,
  MapPin,
  CheckCircle2,
  Clock3,
} from "lucide-react";

import "./App.css";

const API = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const NAVIGATION = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Students", icon: Users, endpoint: "students" },
  { name: "Hostels", icon: Building2, endpoint: "hostels" },
  { name: "Rooms", icon: BedDouble, endpoint: "rooms" },
  { name: "Bookings", icon: ClipboardList, endpoint: "bookings" },
  { name: "Payments", icon: CreditCard, endpoint: "payments" },
  { name: "Maintenance", icon: Wrench, endpoint: "maintenance" },
  { name: "Visitors", icon: UserRound, endpoint: "visitors" },
  { name: "Staff", icon: Users, endpoint: "staff" },
];

const DASHBOARD_MODULES = [
  "Students",
  "Hostels",
  "Rooms",
  "Bookings",
  "Payments",
];

const MODULE_FIELDS = {
  Students: [
    ["reg_number", "Registration number"],
    ["first_name", "First name"],
    ["last_name", "Last name"],
    ["gender", "Gender"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["program", "Programme"],
    ["year_of_study", "Year of study"],
    ["national_id", "National ID"],
  ],

  Hostels: [
    ["name", "Hostel name"],
    ["gender_category", "Gender category"],
    ["address", "Address"],
    ["warden", "Warden"],
  ],

  Rooms: [
    ["room_number", "Room number"],
    ["hostel", "Hostel"],
    ["capacity", "Capacity"],
    ["room_type", "Room type"],
    ["price_per_semester", "Price per semester"],
  ],

  Bookings: [
    ["student", "Student"],
    ["room", "Room"],
    ["booking_date", "Booking date"],
    ["academic_year", "Academic year"],
    ["semester", "Semester"],
    ["start_date", "Start date"],
    ["end_date", "End date"],
    ["status", "Status"],
    ["agreed_price", "Agreed price"],
  ],

  Payments: [
    ["booking", "Booking"],
    ["amount", "Amount"],
    ["payment_date", "Payment date"],
    ["payment_method", "Payment method"],
    ["reference_number", "Reference number"],
    ["payment_status", "Payment status"],
  ],

  Maintenance: [
    ["room", "Room"],
    ["reported_by_student", "Reporting student"],
    ["description", "Description"],
    ["request_date", "Request date"],
    ["priority", "Priority"],
    ["status", "Status"],
    ["assigned_to", "Assigned staff"],
    ["completion_date", "Completion date"],
  ],

  Visitors: [
    ["booking", "Booking"],
    ["visitor_name", "Visitor name"],
    ["phone", "Phone"],
    ["visit_date", "Visit date"],
    ["check_in_time", "Check-in time"],
    ["check_out_time", "Check-out time"],
    ["purpose", "Purpose"],
  ],

  Staff: [
    ["first_name", "First name"],
    ["last_name", "Last name"],
    ["role", "Role"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["employment_date", "Employment date"],
  ],
};

function getRecordId(record) {
  if (!record || typeof record !== "object") return "";

  const preferredKeys = [
    "student_id",
    "hostel_id",
    "room_id",
    "booking_id",
    "payment_id",
    "maintenance_id",
    "request_id",
    "visitor_id",
    "staff_id",
    "id",
  ];

  const key = preferredKeys.find(
    (name) => record[name] !== undefined && record[name] !== null
  );

  if (key) return record[key];

  const fallback = Object.keys(record).find((name) =>
    name.endsWith("_id")
  );

  return fallback ? record[fallback] : "";
}

function formatLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }

  if (typeof value === "object") {
    if (value.name) return String(value.name);
    if (value.id !== undefined) return String(value.id);

    return JSON.stringify(value);
  }

  return String(value);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return formatValue(value);
  }

  return `UGX ${amount.toLocaleString("en-UG", {
    maximumFractionDigits: 2,
  })}`;
}

function isMoneyField(key) {
  return /^(amount|agreed_price|price_per_semester|balance|cost)$/i.test(
    key
  );
}

function getErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "The request timed out. Check whether Django is running.";
  }

  if (error instanceof TypeError) {
    return "Could not connect to Django. Check that the backend is running and the API URL is correct.";
  }

  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

function StatusBadge({ value }) {
  const status = String(value || "Unknown");

  const className = status
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <span className={`status status-${className}`}>
      {status}
    </span>
  );
}

function Notice({ message, kind = "info", onDismiss }) {
  if (!message) return null;

  return (
    <div className={`notice notice-${kind}`} role="status">
      <span>{message}</span>

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function Stat({
  icon: Icon,
  title,
  value,
  note,
  tone = "blue",
  loading,
}) {
  return (
    <article className="stat">
      <div className="stathead">
        <span className={`staticon ${tone}`}>
          <Icon size={20} />
        </span>

        <MoreHorizontal size={19} className="muted-icon" />
      </div>

      <p>{title}</p>

      <div className="statvalue">
        {loading ? (
          <LoaderCircle className="spinning" size={20} />
        ) : (
          value
        )}
      </div>

      <small>{note}</small>
    </article>
  );
}

function ModulePage({
  module,
  records,
  loading,
  error,
  search,
  onSearch,
  onRefresh,
  onView,
  onExport,
}) {
  const fields = MODULE_FIELDS[module] || [];

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return records;

    return records.filter((record) =>
      Object.values(record).some((value) =>
        formatValue(value).toLowerCase().includes(query)
      )
    );
  }, [records, search]);

  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">
            <Database size={13} /> LIVE DATABASE MODULE
          </p>

          <h1>{module}</h1>

          <p className="sub">
            Browse and search {module.toLowerCase()} records from
            your Django API.
          </p>
        </div>

        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={onExport}
            disabled={records.length === 0}
          >
            <Download size={15} />
            Export CSV
          </button>

          <button
            className="secondary"
            type="button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              className={loading ? "spinning" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      <section className="panel module-panel">
        <div className="panelhead">
          <div>
            <h2>{module} records</h2>

            <p>
              {filteredRecords.length} record
              {filteredRecords.length === 1 ? "" : "s"}
              {search.trim()
                ? " matching your search"
                : " available"}
            </p>
          </div>

          <span className="connection-indicator">
            <i />
            Django API
          </span>
        </div>

        <div className="module-toolbar">
          <label className="module-search">
            <Search size={17} />

            <input
              type="search"
              placeholder={`Search ${module.toLowerCase()}...`}
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                className="clear-search"
                aria-label="Clear search"
                onClick={() => onSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </label>

          <button
            className="secondary"
            type="button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Reload
          </button>
        </div>

        {loading && (
          <div className="module-message">
            <LoaderCircle className="spinning" size={25} />
            <p>Loading records from the database...</p>
          </div>
        )}

        {!loading && error && (
          <div className="module-message error-message">
            <AlertCircle size={25} />

            <div>
              <b>Could not load {module.toLowerCase()}</b>
              <p>{error}</p>

              <button
                type="button"
                className="primary"
                onClick={onRefresh}
              >
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="module-message">
            <Database size={25} />

            <div>
              <b>No records returned</b>
              <p>
                The API returned no {module.toLowerCase()} records.
              </p>
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          records.length > 0 &&
          filteredRecords.length === 0 && (
            <div className="module-message">
              <Search size={25} />

              <div>
                <b>No matching records</b>
                <p>Try another search term.</p>
              </div>
            </div>
          )}

        {!loading &&
          !error &&
          filteredRecords.length > 0 && (
            <div className="tablewrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>ID</th>

                    {fields.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}

                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record, index) => (
                    <tr
                      key={
                        getRecordId(record) ||
                        `${module}-${index}`
                      }
                    >
                      <td>{getRecordId(record) || "—"}</td>

                      {fields.map(([key]) => {
                        const value = record[key];

                        const statusField = [
                          "status",
                          "payment_status",
                          "priority",
                        ].includes(key);

                        return (
                          <td key={key}>
                            {statusField ? (
                              <StatusBadge value={value} />
                            ) : isMoneyField(key) ? (
                              formatMoney(value)
                            ) : (
                              formatValue(value)
                            )}
                          </td>
                        );
                      })}

                      <td>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`View ${module} details`}
                          title="View record details"
                          onClick={() => onView(record)}
                        >
                          <Eye size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        <div className="tablefoot">
          <span>
            Showing <b>{filteredRecords.length}</b> of{" "}
            <b>{records.length}</b> records
          </span>

          <span className="read-only-note">
            <Database size={13} />
            Read-only view
          </span>
        </div>
      </section>
    </>
  );
}

function RecordDetails({ record, module, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  return (
    <div
      className="details-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
      >
        <div className="details-header">
          <div>
            <p className="eyebrow">RECORD DETAILS</p>

            <h2 id="details-title">{module}</h2>

            <small>
              Record ID: {getRecordId(record) || "Not available"}
            </small>
          </div>

          <button
            type="button"
            className="icon-button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="details-grid">
          {Object.entries(record).map(([key, value]) => (
            <div className="details-field" key={key}>
              <small>{formatLabel(key)}</small>

              <b>
                {isMoneyField(key)
                  ? formatMoney(value)
                  : formatValue(value)}
              </b>
            </div>
          ))}
        </div>

        <div className="details-footer">
          <span className="read-only-note">
            <Database size={13} />
            Viewing only — no changes made
          </span>

          <button
            type="button"
            className="primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function Dashboard({
  records,
  loadingByModule,
  errorsByModule,
  apiStatus,
  onNavigate,
  onRefresh,
  onNotice,
}) {
  const students = records.Students;
  const hostels = records.Hostels;
  const rooms = records.Rooms;
  const bookings = records.Bookings;
  const payments = records.Payments;

  const totalCapacity = rooms.reduce(
    (total, room) => total + (Number(room.capacity) || 0),
    0
  );

  const pendingPayments = payments.filter((payment) =>
    /pending|unpaid|outstanding/i.test(
      String(payment.payment_status || "")
    )
  );

  const pendingAmount = pendingPayments.reduce(
    (total, payment) => total + (Number(payment.amount) || 0),
    0
  );

  const failedModules = DASHBOARD_MODULES.filter(
    (name) => errorsByModule[name]
  );

  const dashboardLoading = DASHBOARD_MODULES.some(
    (name) => loadingByModule[name]
  );

  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">MANAGEMENT OVERVIEW</p>

          <h1>Good day, Admin</h1>

          <p className="sub">
            An overview of the records currently available in SAHMS.
          </p>
        </div>

        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              onNotice(
                "Open a data module and select Export CSV to download its loaded records."
              )
            }
          >
            <Download size={15} />
            Export data
          </button>

          <button
            className="primary"
            type="button"
            onClick={() =>
              onNotice(
                "Record creation remains disabled until the backend validation rules and database constraints have been verified."
              )
            }
          >
            <Plus size={16} />
            Create new
          </button>
        </div>
      </div>

      {failedModules.length > 0 && (
        <div className="notice notice-warning">
          <AlertCircle size={17} />

          <span>
            Data could not be loaded for: {failedModules.join(", ")}.
            Retry the affected modules or check Django.
          </span>
        </div>
      )}

      <section className="stats">
        <Stat
          icon={Users}
          title="Registered students"
          value={students.length.toLocaleString("en-UG")}
          note={
            errorsByModule.Students
              ? "Request failed — count unavailable"
              : "Records returned by Django"
          }
          tone="blue"
          loading={loadingByModule.Students}
        />

        <Stat
          icon={Building2}
          title="Registered hostels"
          value={hostels.length.toLocaleString("en-UG")}
          note={
            errorsByModule.Hostels
              ? "Request failed — count unavailable"
              : "Hostel records from the API"
          }
          tone="purple"
          loading={loadingByModule.Hostels}
        />

        <Stat
          icon={BedDouble}
          title="Registered rooms"
          value={rooms.length.toLocaleString("en-UG")}
          note={
            errorsByModule.Rooms
              ? "Request failed — count unavailable"
              : `${totalCapacity} bed spaces by room capacity`
          }
          tone="green"
          loading={loadingByModule.Rooms}
        />

        <Stat
          icon={CreditCard}
          title="Pending payment amounts"
          value={
            errorsByModule.Payments
              ? "Unavailable"
              : formatMoney(pendingAmount)
          }
          note="Sum of amounts marked pending/unpaid"
          tone="orange"
          loading={loadingByModule.Payments}
        />
      </section>

      <section className="middle">
        <article className="panel">
          <div className="panelhead">
            <div>
              <h2>Hostel overview</h2>
              <p>Registered hostels and their locations</p>
            </div>

            <button
              className="filter"
              type="button"
              onClick={() => onNavigate("Hostels")}
            >
              View hostels <ArrowUpRight size={14} />
            </button>
          </div>

          {loadingByModule.Hostels ? (
            <div className="module-message compact">
              <LoaderCircle className="spinning" size={20} />
              Loading hostels...
            </div>
          ) : errorsByModule.Hostels ? (
            <div className="module-message compact error-message">
              <AlertCircle size={20} />
              <p>{errorsByModule.Hostels}</p>
            </div>
          ) : hostels.length === 0 ? (
            <div className="module-message compact">
              No hostel records are currently available.
            </div>
          ) : (
            <div className="dashboard-list">
              {hostels.slice(0, 5).map((hostel) => (
                <button
                  type="button"
                  className="dashboard-list-row"
                  key={getRecordId(hostel) || hostel.name}
                  onClick={() => onNavigate("Hostels")}
                >
                  <span className="dashboard-list-icon">
                    <Building2 size={19} />
                  </span>

                  <span className="list-copy">
                    <b>{hostel.name || "Unnamed hostel"}</b>
                    <small>
                      {hostel.address || "Address not provided"}
                    </small>
                  </span>

                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          )}

          <button
            className="allactivity"
            type="button"
            onClick={() => onNavigate("Hostels")}
          >
            View all hostels ↗
          </button>
        </article>

        <article className="panel">
          <div className="panelhead">
            <div>
              <h2>Database connection</h2>
              <p>Current API status</p>
            </div>

            <Database size={19} />
          </div>

          <div className="connection-summary">
            <span
              className={`connection-dot ${apiStatus}`}
            />

            <div>
              <b>
                {apiStatus === "connected"
                  ? "API responding"
                  : apiStatus === "checking"
                    ? "Checking API..."
                    : "API connection issue"}
              </b>

              <p>
                {apiStatus === "connected"
                  ? "Dashboard requests completed successfully."
                  : "Check the Django server and API URL if requests fail."}
              </p>
            </div>
          </div>

          <div className="dashboard-summary-row">
            <span>Booking records</span>
            <b>
              {errorsByModule.Bookings
                ? "Unavailable"
                : bookings.length}
            </b>
          </div>

          <div className="dashboard-summary-row">
            <span>Room records</span>
            <b>
              {errorsByModule.Rooms ? "Unavailable" : rooms.length}
            </b>
          </div>

          <div className="dashboard-summary-row">
            <span>Payment records</span>
            <b>
              {errorsByModule.Payments
                ? "Unavailable"
                : payments.length}
            </b>
          </div>

          <button
            className="allactivity"
            type="button"
            onClick={onRefresh}
            disabled={dashboardLoading}
          >
            <RefreshCw
              size={14}
              className={dashboardLoading ? "spinning" : ""}
            />
            Refresh dashboard data
          </button>
        </article>
      </section>

      <section className="panel hostels">
        <div className="panelhead">
          <div>
            <h2>Hostel directory</h2>
            <p>Hostels returned by the database API</p>
          </div>

          <button
            className="textbutton"
            type="button"
            onClick={() => onNavigate("Hostels")}
          >
            View all hostels ↗
          </button>
        </div>

        {loadingByModule.Hostels ? (
          <div className="module-message compact">
            <LoaderCircle className="spinning" size={20} />
            Loading directory...
          </div>
        ) : errorsByModule.Hostels ? (
          <div className="module-message compact error-message">
            <AlertCircle size={20} />
            <p>{errorsByModule.Hostels}</p>
          </div>
        ) : hostels.length === 0 ? (
          <div className="module-message compact">
            No hostels to display.
          </div>
        ) : (
          <div className="hostelgrid">
            {hostels.slice(0, 3).map((hostel, index) => (
              <article
                className="hostelcard"
                key={getRecordId(hostel) || hostel.name}
              >
                <div className={`building ill${index % 3}`}>
                  <span>
                    HOSTEL {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="buildingart">
                    {Array.from({ length: 9 }, (_, item) => (
                      <i key={item} />
                    ))}
                  </div>

                  <MoreHorizontal />
                </div>

                <div className="hostelinfo">
                  <div className="hosteltitle">
                    <h3>{hostel.name || "Unnamed hostel"}</h3>

                    <span>
                      <CheckCircle2 size={12} />
                      Registered
                    </span>
                  </div>

                  <p className="location">
                    <MapPin size={13} />
                    {hostel.address || "Address not provided"}
                  </p>

                  <div className="metrics">
                    <div>
                      <small>Hostel ID</small>
                      <b>{getRecordId(hostel) || "—"}</b>
                    </div>

                    <div>
                      <small>Warden</small>
                      <b>{formatValue(hostel.warden)}</b>
                    </div>
                  </div>

                  <button
                    className="detail"
                    type="button"
                    onClick={() => onNavigate("Hostels")}
                  >
                    View hostel records <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel bookings">
        <div className="panelhead">
          <div>
            <h2>Recent bookings</h2>
            <p>
              Booking records returned by Django. API ordering may vary.
            </p>
          </div>

          <button
            className="filter"
            type="button"
            onClick={() => onNavigate("Bookings")}
          >
            View bookings
          </button>
        </div>

        {loadingByModule.Bookings ? (
          <div className="module-message compact">
            <LoaderCircle className="spinning" size={20} />
            Loading bookings...
          </div>
        ) : errorsByModule.Bookings ? (
          <div className="module-message compact error-message">
            <AlertCircle size={20} />
            <p>{errorsByModule.Bookings}</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="module-message compact">
            <ClipboardList size={24} />
            <p>No booking records are available to display.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>BOOKING ID</th>
                  <th>STUDENT ID</th>
                  <th>ROOM ID</th>
                  <th>BOOKING DATE</th>
                  <th>AGREED PRICE</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                {bookings.slice(0, 5).map((booking, index) => (
                  <tr
                    key={
                      getRecordId(booking) ||
                      `booking-${index}`
                    }
                  >
                    <td>{getRecordId(booking) || "—"}</td>
                    <td>{formatValue(booking.student)}</td>
                    <td>{formatValue(booking.room)}</td>
                    <td>{formatValue(booking.booking_date)}</td>
                    <td>{formatMoney(booking.agreed_price)}</td>
                    <td>
                      <StatusBadge value={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tablefoot">
          <span>
            Displaying <b>{Math.min(bookings.length, 5)}</b> of{" "}
            <b>{bookings.length}</b> loaded bookings
          </span>

          <button
            className="textbutton"
            type="button"
            onClick={() => onNavigate("Bookings")}
          >
            Open bookings ↗
          </button>
        </div>
      </section>

      <footer>
        © {new Date().getFullYear()} SAHMS · Student Accommodation
        &amp; Hostel Management System
        <span>Built for better campus living ♥</span>
      </footer>
    </>
  );
}

export default function App() {
  const [active, setActive] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState("info");
  const [recordsByModule, setRecordsByModule] = useState({});
  const [loadingByModule, setLoadingByModule] = useState({});
  const [errorsByModule, setErrorsByModule] = useState({});
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNavigation = NAVIGATION.find(
    (item) => item.name === active
  );

  const activeEndpoint = activeNavigation?.endpoint;

  const notify = useCallback((message, kind = "info") => {
    setNotice(message);
    setNoticeKind(kind);
  }, []);

  const loadModule = useCallback(async (moduleName) => {
    const navigationItem = NAVIGATION.find(
      (item) => item.name === moduleName
    );

    if (!navigationItem?.endpoint) return;

    setLoadingByModule((previous) => ({
      ...previous,
      [moduleName]: true,
    }));

    setErrorsByModule((previous) => ({
      ...previous,
      [moduleName]: "",
    }));

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      20000
    );

    try {
      const response = await fetch(
        `${API}/${navigationItem.endpoint}/`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        let message = `Request failed with HTTP ${response.status}`;

        try {
          const body = await response.json();
          message = body.detail || body.error || message;
        } catch {
          // Retain the HTTP status message.
        }

        throw new Error(message);
      }

      const data = await response.json();

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.results)
          ? data.results
          : null;

      if (!rows) {
        throw new Error(
          "The API response was not a list of records."
        );
      }

      setRecordsByModule((previous) => ({
        ...previous,
        [moduleName]: rows,
      }));

      setLastUpdated(new Date());
    } catch (error) {
      setErrorsByModule((previous) => ({
        ...previous,
        [moduleName]: getErrorMessage(error),
      }));
    } finally {
      window.clearTimeout(timeout);

      setLoadingByModule((previous) => ({
        ...previous,
        [moduleName]: false,
      }));
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    await Promise.all(DASHBOARD_MODULES.map(loadModule));
  }, [loadModule]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (activeEndpoint) loadModule(active);
  }, [active, activeEndpoint, loadModule]);

  const records = {
    Students: recordsByModule.Students || [],
    Hostels: recordsByModule.Hostels || [],
    Rooms: recordsByModule.Rooms || [],
    Bookings: recordsByModule.Bookings || [],
    Payments: recordsByModule.Payments || [],
    Maintenance: recordsByModule.Maintenance || [],
    Visitors: recordsByModule.Visitors || [],
    Staff: recordsByModule.Staff || [],
  };

  const dashboardLoading = DASHBOARD_MODULES.some(
    (name) => loadingByModule[name]
  );

  const dashboardErrors = DASHBOARD_MODULES.some(
    (name) => errorsByModule[name]
  );

  const dashboardAllLoaded = DASHBOARD_MODULES.every(
    (name) =>
      Object.prototype.hasOwnProperty.call(
        recordsByModule,
        name
      ) && !errorsByModule[name]
  );

  const apiStatus =
    dashboardLoading && !dashboardAllLoaded
      ? "checking"
      : dashboardAllLoaded && !dashboardErrors
        ? "connected"
        : "disconnected";

  function navigateTo(moduleName) {
    setActive(moduleName);
    setSearch("");
    setNotice("");
    setSelectedRecord(null);
    setMobileMenuOpen(false);
  }

  function handleGlobalSearch(value) {
    setSearch(value);

    if (active === "Dashboard" && value.trim()) {
      setActive("Students");
    }
  }

  function exportRecords(moduleName = active) {
    const rows = recordsByModule[moduleName] || [];

    if (!rows.length) {
      notify(
        `There are no loaded ${moduleName.toLowerCase()} records to export.`,
        "warning"
      );
      return;
    }

    const headers = [
      ...new Set(rows.flatMap((row) => Object.keys(row))),
    ];

    function csvCell(value) {
      const text =
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : formatValue(value);

      return `"${String(text).replace(/"/g, '""')}"`;
    }

    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map((row) =>
        headers.map((key) => csvCell(row[key])).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${moduleName.toLowerCase()}-export-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    notify(`${moduleName} CSV export prepared.`, "success");
  }

  return (
    <div className="layout">
      {mobileMenuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${
          mobileMenuOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="brand">
          <span>
            <Building2 size={23} />
          </span>

          <div>
            <b>SAHMS</b>
            <small>HOSTEL MANAGEMENT</small>
          </div>
        </div>

        <p className="label">WORKSPACE</p>

        <nav aria-label="Main navigation">
          {NAVIGATION.map(({ name, icon: Icon }) => (
            <button
              type="button"
              key={name}
              className={active === name ? "selected" : ""}
              aria-current={active === name ? "page" : undefined}
              onClick={() => navigateTo(name)}
            >
              <Icon size={18} />

              {name}

              {name === "Maintenance" &&
                records.Maintenance.length > 0 && (
                  <i>{records.Maintenance.length}</i>
                )}
            </button>
          ))}
        </nav>

        <div className="sidebarfoot">
          <div className="help">
            <b>Need help?</b>

            <p>
              Contact your system administrator for assistance.
            </p>

            <button
              type="button"
              onClick={() =>
                notify(
                  "Please contact your system administrator for support."
                )
              }
            >
              Open help centre ↗
            </button>
          </div>

          <div className="admin">
            <span>AD</span>

            <div>
              <b>System Admin</b>
              <small>Administrator</small>
            </div>

            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div className="header-left">
            <button
              type="button"
              className="mobile-menu"
              aria-label={
                mobileMenuOpen
                  ? "Close navigation"
                  : "Open navigation"
              }
              onClick={() =>
                setMobileMenuOpen((previous) => !previous)
              }
            >
              {mobileMenuOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>

            <div className="crumb">
              Workspace <span>/</span> <b>{active}</b>
            </div>
          </div>

          <div className="headright">
            <label className="global-search">
              <Search size={16} />

              <input
                aria-label={`Search ${active}`}
                placeholder={`Search ${
                  active === "Dashboard"
                    ? "students"
                    : active.toLowerCase()
                }...`}
                value={search}
                onChange={(event) =>
                  handleGlobalSearch(event.target.value)
                }
              />

              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>

            <button
              type="button"
              className="bell"
              aria-label="API status notification"
              onClick={() =>
                notify(
                  dashboardErrors
                    ? "At least one dashboard API request failed. Open the affected module and retry."
                    : dashboardAllLoaded
                      ? "Dashboard data has been retrieved from Django."
                      : "Dashboard requests are still loading."
                )
              }
            >
              <Bell size={19} />
              {dashboardErrors && <i />}
            </button>

            <div className="user">
              <span>AD</span>

              <div>
                <b>Admin</b>
                <small>Administrator</small>
              </div>

              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="content">
          <Notice
            message={notice}
            kind={noticeKind}
            onDismiss={() => setNotice("")}
          />

          {active === "Dashboard" ? (
            <>
              <Dashboard
                records={records}
                loadingByModule={loadingByModule}
                errorsByModule={errorsByModule}
                apiStatus={apiStatus}
                onNavigate={navigateTo}
                onRefresh={refreshDashboard}
                onNotice={notify}
              />

              <div className="dashboard-refresh-note">
                {lastUpdated && (
                  <span>
                    <Clock3 size={13} />
                    Last successful response:{" "}
                    {lastUpdated.toLocaleTimeString()}
                  </span>
                )}

                <button
                  type="button"
                  className="textbutton"
                  onClick={refreshDashboard}
                  disabled={dashboardLoading}
                >
                  <RefreshCw
                    size={13}
                    className={
                      dashboardLoading ? "spinning" : ""
                    }
                  />
                  Refresh dashboard
                </button>
              </div>
            </>
          ) : (
            <>
              <ModulePage
                module={active}
                records={records[active] || []}
                loading={!!loadingByModule[active]}
                error={errorsByModule[active] || ""}
                search={search}
                onSearch={setSearch}
                onRefresh={() => loadModule(active)}
                onView={setSelectedRecord}
                onExport={() => exportRecords(active)}
              />

              <footer>
                © {new Date().getFullYear()} SAHMS · Student
                Accommodation &amp; Hostel Management System
                <span>Built for better campus living ♥</span>
              </footer>
            </>
          )}
        </div>
      </main>

      {selectedRecord && (
        <RecordDetails
          record={selectedRecord}
          module={active}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}