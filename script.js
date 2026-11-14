"use strict";

/* =========================================================
   TICKET DESK — Supabase-backed version
========================================================= */

const SUPABASE_URL = "https://yluzrfoothkhbdfcavfg.supabase.co";
const SUPABASE_KEY = "sb_publishable_9Ins0PD_oA_6v0F_HHollg_FokXFxZl";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const makeId = (prefix = "CMP") =>
    `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36).slice(2, 7).toUpperCase()}`;

const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);

const emailFormat = email => email.trim().toLowerCase();

const formatDate = date => {
    if (!date) return "—";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

/* ---------- in-memory caches ---------- */

let users = [];
let complaints = [];
let notifications = [];
let session = null;
let selectedComplaintId = null;

/* ---------- data loaders ---------- */

async function loadUsers() {
    const { data, error } = await supabaseClient.from("users").select("*");
    if (error) { console.error(error); return; }
    users = data;
}

async function loadComplaints() {
    const { data, error } = await supabaseClient.from("complaints").select("*");
    if (error) { console.error(error); return; }
    complaints = data.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        category: row.category,
        priority: row.priority,
        contact: row.contact,
        description: row.description,
        status: row.status,
        assignedStaffId: row.assigned_staff_id,
        staffResponse: row.staff_response,
        adminRemarks: row.admin_remarks,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        history: row.history || []
    }));
}

async function loadNotifications() {
    const { data, error } = await supabaseClient.from("notifications").select("*");
    if (error) { console.error(error); return; }
    notifications = data.map(row => ({
        id: row.id,
        userId: row.user_id,
        message: row.message,
        type: row.type,
        read: row.read,
        createdAt: row.created_at
    }));
}

function loadSession() {
    const raw = localStorage.getItem("ticketDeskSession");
    session = raw ? JSON.parse(raw) : null;
}

function saveSession() {
    if (session) localStorage.setItem("ticketDeskSession", JSON.stringify(session));
    else localStorage.removeItem("ticketDeskSession");
}

/* ---------- helpers ---------- */

function currentUser() {
    return session ? users.find(u => u.id === session.userId) || null : null;
}

function getComplaint(id) { return complaints.find(c => c.id === id); }
function getStaff() { return users.filter(u => u.role === "staff"); }
function getUserName(id) { return users.find(u => u.id === id)?.name || "Unknown user"; }
function getStaffOccupation(id) { return id ? users.find(u => u.id === id)?.occupation || "" : ""; }

function getStaffLabel(id) {
    if (!id) return "Not assigned";
    const s = users.find(u => u.id === id);
    if (!s) return "Unknown staff";
    return s.occupation ? `${s.name} (${s.occupation})` : s.name;
}

function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function setError(id, message = "") { const el = $(id); if (el) el.textContent = message; }
function show(id) { const el = $(id); if (el) el.hidden = false; }
function hide(id) { const el = $(id); if (el) el.hidden = true; }

function toast(message, type = "success") {
    let el = $("resolveToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "resolveToast";
        el.className = "toast";
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}

function statusBadge(status) {
    const safe = escapeHTML(status || "Open");
    const css = safe.toLowerCase().replace(/\s+/g, "-");
    return `<span class="status-badge status-${css}">${safe}</span>`;
}

function priorityBadge(priority) {
    const safe = escapeHTML(priority || "Medium");
    const css = safe.toLowerCase();
    return `<span class="priority-badge priority-${css}">${safe}</span>`;
}

async function notify(userId, message, type = "info") {
    const row = { id: makeId("NOT"), user_id: userId, message, type, read: false };
    const { error } = await supabaseClient.from("notifications").insert(row);
    if (error) console.error(error);
    else notifications.push({ ...row, userId, createdAt: new Date().toISOString() });
}

function userNotifications(userId) {
    return notifications
        .filter(n => n.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* =========================================================
   AUTH
========================================================= */

function initializeAuth() {
    $("showRegister")?.addEventListener("click", () => {
        hide("loginSection"); show("registerSection"); setError("registerError");
    });
    $("showLogin")?.addEventListener("click", () => {
        hide("registerSection"); show("loginSection"); setError("loginError");
    });
    $("registerRole")?.addEventListener("change", toggleOccupationField);
    $("loginForm")?.addEventListener("submit", login);
    $("registerForm")?.addEventListener("submit", register);
}

function toggleOccupationField() {
    const roleSelect = $("registerRole");
    const group = $("registerOccupationGroup");
    const input = $("registerOccupation");
    if (!roleSelect || !group) return;
    const isStaff = roleSelect.value === "staff";
    group.hidden = !isStaff;
    if (input) { input.required = isStaff; if (!isStaff) input.value = ""; }
}

async function register(event) {
    event.preventDefault();
    setError("registerError");

    const name = $("registerName").value.trim();
    const email = emailFormat($("registerEmail").value);
    const password = $("registerPassword").value;
    const confirmation = $("confirmPassword").value;
    const role = $("registerRole").value;
    const occupation = $("registerOccupation")?.value.trim() || "";

    if (!name || !email || !password || !confirmation)
        return setError("registerError", "Complete all required fields.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return setError("registerError", "Enter a valid email address.");
    if (password.length < 8)
        return setError("registerError", "Password must contain at least 8 characters.");
    if (password !== confirmation)
        return setError("registerError", "Passwords do not match.");
    if (!["user", "staff", "admin"].includes(role))
        return setError("registerError", "Select a valid account role.");
    if (role === "staff" && !occupation)
        return setError("registerError", "Occupation is required for staff accounts.");
    if (users.some(u => u.email === email))
        return setError("registerError", "This email is already registered.");

    const newUser = {
        id: makeId("USR"), name, email, password, role,
        occupation: role === "staff" ? occupation : ""
    };

    const { error } = await supabaseClient.from("users").insert(newUser);
    if (error) return setError("registerError", error.message);

    users.push(newUser);
    $("registerForm").reset();
    hide("registerSection");
    show("loginSection");
    $("loginEmail").value = email;
    if ($("registerOccupationGroup")) $("registerOccupationGroup").hidden = true;
    toast("Account created successfully. Please sign in.");
}

async function login(event) {
    event.preventDefault();
    setError("loginError");

    await loadUsers();

    const email = emailFormat($("loginEmail").value);
    const password = $("loginPassword").value;
    const role = $("loginRole").value;

    if (!users.some(u => u.email === email))
        return setError("loginError", "Account does not exist.");

    const user = users.find(u =>
        u.email === email && u.password === password && u.role === role
    );
    if (!user) return setError("loginError", "Invalid login credentials.");

    session = { userId: user.id, loginAt: new Date().toISOString() };
    saveSession();
    await renderApplication();
}

function logout() {
    session = null;
    selectedComplaintId = null;
    saveSession();
    document.querySelectorAll(".app-shell").forEach(el => el.hidden = true);
    show("authScreen");
    $("loginForm")?.reset();
    toast("You have been logged out.");
}

/* =========================================================
   NAVIGATION
========================================================= */

function navigateTo(pageId) {
    const page = $(pageId);
    if (!page || !page.classList.contains("page-section")) return;
    const dashboard = page.closest(".app-shell");
    if (!dashboard || dashboard.hidden) return;

    dashboard.querySelectorAll(".page-section").forEach(s => {
        s.hidden = true; s.classList.remove("active");
    });
    page.hidden = false; page.classList.add("active");

    dashboard.querySelectorAll(".nav-link").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    if (pageId === "user-complaints") renderUserComplaints();
    if (pageId === "user-notifications") renderNotifications("user");
    if (pageId === "staff-assigned") renderStaffComplaints();
    if (pageId === "staff-notifications") renderNotifications("staff");
    if (pageId === "admin-complaints") renderAdminComplaints();
    if (pageId === "admin-assignment") renderUnassignedComplaints();
    if (pageId === "admin-staff") renderAdminStaff();
    if (pageId === "admin-reports") renderAdminReports();
    if (pageId === "admin-notifications") renderNotifications("admin");
}

function initializeNavigation() {
    document.addEventListener("click", event => {
        const button = event.target.closest("[data-page]");
        if (!button) return;
        event.preventDefault();
        navigateTo(button.dataset.page);
    });
}

/* =========================================================
   STARTUP
========================================================= */

async function renderApplication() {
    await loadUsers();
    await loadComplaints();
    await loadNotifications();

    const user = currentUser();
    if (!user) {
        session = null; saveSession();
        document.querySelectorAll(".app-shell").forEach(el => el.hidden = true);
        show("authScreen");
        return;
    }

    hide("authScreen");
    document.querySelectorAll(".app-shell").forEach(el => {
        el.hidden = el.dataset.dashboard !== user.role;
    });

    if (user.role === "user") { renderUserDashboard(user); navigateTo("user-overview"); }
    if (user.role === "staff") { renderStaffDashboard(user); navigateTo("staff-overview"); }
    if (user.role === "admin") { renderAdminDashboard(user); navigateTo("admin-overview"); }
}

function initialize() {
    initializeAuth();
    initializeNavigation();
    initializeUserFeatures();
    initializeStaffFeatures();
    initializeAdminFeatures();
    initializeLogout();

    loadSession();
    renderApplication();
}

function initializeLogout() {
    ["userLogoutButton", "staffLogoutButton", "adminLogoutButton"]
        .forEach(id => $(id)?.addEventListener("click", logout));
}

/* =========================================================
   USER DASHBOARD
========================================================= */

function renderUserDashboard(user) {
    const own = complaints.filter(c => c.userId === user.id);
    setText("userWelcome", user.name);
    setText("totalTicketsCount", own.length);
    setText("openTicketsCount", own.filter(c => ["Open","Assigned"].includes(c.status)).length);
    setText("progressTicketsCount", own.filter(c => c.status === "In Progress").length);
    setText("resolvedTicketsCount", own.filter(c => ["Resolved","Closed"].includes(c.status)).length);
    renderUserComplaints();
    renderUserProfile();
}

function initializeUserFeatures() {
    $("createTicketForm")?.addEventListener("submit", createComplaint);
    $("editTicketForm")?.addEventListener("submit", editComplaint);
    $("userProfileForm")?.addEventListener("submit", updateProfile);
    $("ticketSearch")?.addEventListener("input", renderUserComplaints);
    $("ticketStatusFilter")?.addEventListener("change", renderUserComplaints);
    $("ticketPriorityFilter")?.addEventListener("change", renderUserComplaints);
    $("closeTicketDetailsButton")?.addEventListener("click", () => {
        hide("ticketDetailsSection"); selectedComplaintId = null;
    });
    $("cancelEditTicketButton")?.addEventListener("click", () => hide("editTicketSection"));
    $("userTicketsTableBody")?.addEventListener("click", handleUserComplaintActions);
}

async function createComplaint(event) {
    event.preventDefault();
    setError("createTicketError");

    const user = currentUser();
    if (!user || user.role !== "user") return;

    const title = $("ticketTitle").value.trim();
    const category = $("ticketCategory").value;
    const priority = $("ticketPriority").value;
    const contact = $("ticketContact").value.trim();
    const description = $("ticketDescription").value.trim();

    if (!title || !category || !description)
        return setError("createTicketError", "Complete all required fields.");

    const id = makeId();
    const history = [{
        status: "Open", message: "Complaint submitted by user.",
        actorId: user.id, date: new Date().toISOString()
    }];

    const row = {
        id, user_id: user.id, title, category, priority, contact, description,
        status: "Open", assigned_staff_id: null, staff_response: "",
        admin_remarks: "", history
    };

    const { error } = await supabaseClient.from("complaints").insert(row);
    if (error) return setError("createTicketError", error.message);

    await notify(user.id, `Your complaint ${id} has been submitted successfully.`, "success");
    for (const admin of users.filter(u => u.role === "admin"))
        await notify(admin.id, `New complaint submitted: ${title} (${id}).`);

    $("createTicketForm").reset();
    await renderApplication();
    navigateTo("user-complaints");
    toast("Complaint submitted successfully.");
}

function filteredUserComplaints() {
    const user = currentUser();
    if (!user) return [];
    const search = $("ticketSearch")?.value.trim().toLowerCase() || "";
    const status = $("ticketStatusFilter")?.value || "";
    const priority = $("ticketPriorityFilter")?.value || "";

    return complaints
        .filter(c => c.userId === user.id)
        .filter(c => {
            const t = `${c.id} ${c.title} ${c.category} ${c.description}`;
            return !search || t.toLowerCase().includes(search);
        })
        .filter(c => !status || c.status === status)
        .filter(c => !priority || c.priority === priority)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderUserComplaints() {
    const tbody = $("userTicketsTableBody");
    if (!tbody) return;
    const result = filteredUserComplaints();
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="8">No complaints found.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${escapeHTML(c.category)}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td>${statusBadge(c.status)}</td>
            <td>${escapeHTML(getStaffLabel(c.assignedStaffId))}</td>
            <td>${formatDate(c.createdAt)}</td>
            <td>
                <button type="button" class="btn btn-small" data-action="view" data-id="${escapeHTML(c.id)}">View</button>
                <button type="button" class="btn btn-small" data-action="edit" data-id="${escapeHTML(c.id)}">Edit</button>
                <button type="button" class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHTML(c.id)}">Delete</button>
            </td>`;
        tbody.appendChild(row);
    });
}

function handleUserComplaintActions(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "view") viewComplaint(id);
    if (button.dataset.action === "edit") openEditComplaint(id);
    if (button.dataset.action === "delete") deleteComplaint(id);
}

function viewComplaint(id) {
    const user = currentUser();
    const item = getComplaint(id);
    if (!user || !item || item.userId !== user.id) return;
    selectedComplaintId = id;
    setText("detailTicketId", item.id);
    setText("detailTicketTitle", item.title);
    setText("detailTicketCategory", item.category);
    setText("detailTicketPriority", item.priority);
    setText("detailTicketStatus", item.status);
    setText("detailAssignedStaff", getStaffLabel(item.assignedStaffId));
    setText("detailTicketDate", formatDate(item.createdAt));
    setText("detailTicketDescription", item.description);
    setText("detailStaffResponse", item.staffResponse || "No staff update has been submitted.");
    show("ticketDetailsSection");
    $("ticketDetailsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openEditComplaint(id) {
    const user = currentUser();
    const item = getComplaint(id);
    if (!user || !item || item.userId !== user.id) return;
    if (!["Open","Assigned"].includes(item.status))
        return toast("This complaint can no longer be edited.", "error");
    $("editTicketId").value = item.id;
    $("editTicketTitle").value = item.title;
    $("editTicketCategory").value = item.category;
    $("editTicketPriority").value = item.priority;
    $("editTicketDescription").value = item.description;
    setError("editTicketError");
    show("editTicketSection");
    $("editTicketSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function editComplaint(event) {
    event.preventDefault();
    setError("editTicketError");
    const user = currentUser();
    const item = getComplaint($("editTicketId").value);
    if (!user || !item || item.userId !== user.id) return;
    if (!["Open","Assigned"].includes(item.status))
        return setError("editTicketError", "This complaint can no longer be edited.");

    const title = $("editTicketTitle").value.trim();
    const category = $("editTicketCategory").value;
    const priority = $("editTicketPriority").value;
    const description = $("editTicketDescription").value.trim();
    if (!title || !category || !description)
        return setError("editTicketError", "Complete all required fields.");

    const history = [...(item.history || []), {
        status: item.status, message: "Complaint details updated by user.",
        actorId: user.id, date: new Date().toISOString()
    }];

    const { error } = await supabaseClient.from("complaints").update({
        title, category, priority, description,
        updated_at: new Date().toISOString(), history
    }).eq("id", item.id);
    if (error) return setError("editTicketError", error.message);

    hide("editTicketSection");
    await renderApplication();
    navigateTo("user-complaints");
    toast("Complaint updated successfully.");
}

async function deleteComplaint(id) {
    const user = currentUser();
    const item = getComplaint(id);
    if (!user || !item || item.userId !== user.id) return;
    if (!confirm(`Delete complaint ${id}? This action cannot be undone.`)) return;

    const { error } = await supabaseClient.from("complaints").delete().eq("id", id);
    if (error) return toast(error.message, "error");

    await notify(user.id, `Complaint ${id} was deleted from your account.`, "info");
    if (selectedComplaintId === id) { selectedComplaintId = null; hide("ticketDetailsSection"); }
    await renderApplication();
    toast("Complaint deleted.");
}

/* =========================================================
   STAFF DASHBOARD
========================================================= */

function initializeStaffFeatures() {
    $("staffSearch")?.addEventListener("input", renderStaffComplaints);
    $("staffStatusFilter")?.addEventListener("change", renderStaffComplaints);
    $("staffUpdateForm")?.addEventListener("submit", submitStaffUpdate);

    $("staffComplaintsBody")?.addEventListener("click", event => {
        const b = event.target.closest("[data-action='update']");
        if (!b) return;
        $("staffUpdateComplaintId").value = b.dataset.id;
        $("staffUpdateForm").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    $("staffRecentComplaintsBody")?.addEventListener("click", event => {
        const b = event.target.closest("[data-action='update']");
        if (!b) return;
        navigateTo("staff-assigned");
        $("staffUpdateComplaintId").value = b.dataset.id;
    });
    $("staffProfileForm")?.addEventListener("submit", updateProfile);
}

function staffAssigned(user) {
    return complaints.filter(c => c.assignedStaffId === user.id);
}

function renderStaffDashboard(user) {
    const assigned = staffAssigned(user);
    setText("staffWelcome", user.occupation ? `${user.name} · ${user.occupation}` : user.name);
    setText("staffAssignedCount", assigned.length);
    setText("staffProgressCount", assigned.filter(c => c.status === "In Progress").length);
    setText("staffResolvedCount", assigned.filter(c => ["Resolved","Closed"].includes(c.status)).length);
    renderStaffComplaints();
    renderStaffRecentComplaints();
    renderStaffUpdateOptions();
    renderStaffProfile();
}

function renderStaffComplaints() {
    const tbody = $("staffComplaintsBody");
    const user = currentUser();
    if (!tbody || !user || user.role !== "staff") return;
    const search = $("staffSearch")?.value.trim().toLowerCase() || "";
    const status = $("staffStatusFilter")?.value || "";
    const result = staffAssigned(user)
        .filter(c => {
            const t = `${c.id} ${c.title} ${c.category}`;
            return !search || t.toLowerCase().includes(search);
        })
        .filter(c => !status || c.status === status);
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="6">No assigned complaints.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${escapeHTML(c.category)}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td>${statusBadge(c.status)}</td>
            <td><button class="btn btn-small" type="button" data-action="update" data-id="${escapeHTML(c.id)}">Update</button></td>`;
        tbody.appendChild(row);
    });
}

function renderStaffRecentComplaints() {
    const tbody = $("staffRecentComplaintsBody");
    const user = currentUser();
    if (!tbody || !user) return;
    const result = staffAssigned(user)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5);
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="5">No assigned complaints.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td>${statusBadge(c.status)}</td>
            <td><button class="btn btn-small" data-action="update" data-id="${escapeHTML(c.id)}" type="button">Update</button></td>`;
        tbody.appendChild(row);
    });
}

function renderStaffUpdateOptions() {
    const select = $("staffUpdateComplaintId");
    const user = currentUser();
    if (!select || !user) return;
    const previous = select.value;
    select.innerHTML = `<option value="">Select assigned complaint</option>`;
    staffAssigned(user).forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.id} — ${c.title}`;
        select.appendChild(opt);
    });
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

async function submitStaffUpdate(event) {
    event.preventDefault();
    setError("staffUpdateError");
    const user = currentUser();
    if (!user || user.role !== "staff") return;

    const id = $("staffUpdateComplaintId").value;
    const status = $("staffUpdateStatus").value;
    const message = $("staffUpdateMessage").value.trim();
    const item = getComplaint(id);

    if (!item || item.assignedStaffId !== user.id)
        return setError("staffUpdateError", "Select a complaint assigned to you.");
    if (!["Assigned","In Progress"].includes(item.status))
        return setError("staffUpdateError", "This complaint is already resolved.");
    if (!message)
        return setError("staffUpdateError", "Enter a progress report.");
    if (!["In Progress","Resolved"].includes(status))
        return setError("staffUpdateError", "Select a valid status.");

    const history = [...(item.history || []), {
        status, message, actorId: user.id, date: new Date().toISOString()
    }];

    const { error } = await supabaseClient.from("complaints").update({
        status, staff_response: message,
        updated_at: new Date().toISOString(), history
    }).eq("id", item.id);
    if (error) return setError("staffUpdateError", error.message);

    const staffLabel = user.occupation ? `${user.name} (${user.occupation})` : user.name;
    for (const admin of users.filter(u => u.role === "admin"))
        await notify(admin.id, `${staffLabel} updated ${item.id}: ${status}. ${message}`);
    await notify(item.userId, `Your complaint ${item.id} is now ${status}. ${message}`);

    $("staffUpdateForm").reset();
    await renderApplication();
    navigateTo("staff-assigned");
    toast("Progress report submitted successfully.");
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function initializeAdminFeatures() {
    $("adminSearch")?.addEventListener("input", renderAdminComplaints);
    $("adminStatusFilter")?.addEventListener("change", renderAdminComplaints);
    $("assignmentSearch")?.addEventListener("input", renderUnassignedComplaints);
    $("adminStaffSearch")?.addEventListener("input", renderAdminStaff);
    $("adminUpdateComplaintForm")?.addEventListener("submit", saveAdminComplaint);

    $("closeAdminComplaintDetails")?.addEventListener("click", () => {
        hide("adminComplaintDetails"); selectedComplaintId = null;
    });
    $("adminComplaintsBody")?.addEventListener("click", event => {
        const b = event.target.closest("[data-action='manage']");
        if (b) openAdminComplaint(b.dataset.id);
    });
    $("unassignedComplaintsBody")?.addEventListener("click", event => {
        const b = event.target.closest("[data-action='assign']");
        if (b) openAdminComplaint(b.dataset.id);
    });
    $("adminStaffList")?.addEventListener("click", event => {
        const b = event.target.closest("[data-action='staff-complaints']");
        if (!b) return;
        navigateTo("admin-complaints");
        $("adminSearch").value = b.dataset.name || "";
        renderAdminComplaints();
    });
    $("exportReportButton")?.addEventListener("click", exportCSV);
    $("adminProfileForm")?.addEventListener("submit", updateProfile);
}

function renderAdminDashboard(user) {
    setText("adminWelcome", user.name);
    const count = s => complaints.filter(c => c.status === s).length;
    setText("adminTotalCount", complaints.length);
    setText("adminOpenCount", count("Open"));
    setText("adminAssignedCount", count("Assigned"));
    setText("adminProgressCount", count("In Progress"));
    setText("adminResolvedCount", count("Resolved") + count("Closed"));
    renderAdminComplaints();
    renderAdminRecentComplaints();
    renderUnassignedComplaints();
    renderAdminStaff();
    renderAdminReports();
    renderAdminProfile();
}

function renderAdminComplaints() {
    const tbody = $("adminComplaintsBody");
    if (!tbody) return;
    const search = $("adminSearch")?.value.trim().toLowerCase() || "";
    const status = $("adminStatusFilter")?.value || "";
    const result = complaints
        .filter(c => {
            const owner = getUserName(c.userId);
            const staff = getStaffLabel(c.assignedStaffId);
            const t = `${c.id} ${c.title} ${c.category} ${owner} ${staff}`;
            return !search || t.toLowerCase().includes(search);
        })
        .filter(c => !status || c.status === status)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="7">No complaints found.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${escapeHTML(getUserName(c.userId))}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td>${statusBadge(c.status)}</td>
            <td>${escapeHTML(getStaffLabel(c.assignedStaffId))}</td>
            <td><button type="button" class="btn btn-small" data-action="manage" data-id="${escapeHTML(c.id)}">Manage</button></td>`;
        tbody.appendChild(row);
    });
}

function renderAdminRecentComplaints() {
    const tbody = $("adminRecentComplaintsBody");
    if (!tbody) return;
    const result = [...complaints]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="5">No complaints available.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${escapeHTML(getUserName(c.userId))}</td>
            <td>${statusBadge(c.status)}</td>
            <td>${escapeHTML(getStaffLabel(c.assignedStaffId))}</td>`;
        tbody.appendChild(row);
    });
}

function openAdminComplaint(id) {
    const item = getComplaint(id);
    const admin = currentUser();
    if (!item || !admin || admin.role !== "admin") return;
    navigateTo("admin-complaints");
    selectedComplaintId = id;
    $("adminComplaintId").value = item.id;
    $("adminComplaintInformation").textContent =
        `${item.title} | Submitted by ${getUserName(item.userId)} | ${item.category} | ${item.priority}`;
    const staffSelect = $("adminAssignStaff");
    staffSelect.innerHTML = `<option value="">Unassigned</option>`;
    getStaff().forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.occupation
            ? `${p.name} — ${p.occupation} (${p.email})`
            : `${p.name} (${p.email})`;
        staffSelect.appendChild(opt);
    });
    staffSelect.value = item.assignedStaffId || "";
    $("adminUpdateStatus").value = item.status;
    $("adminRemarks").value = "";
    setError("adminUpdateError");
    show("adminComplaintDetails");
    $("adminComplaintDetails").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveAdminComplaint(event) {
    event.preventDefault();
    setError("adminUpdateError");
    const admin = currentUser();
    const id = $("adminComplaintId").value;
    const item = getComplaint(id);
    if (!admin || admin.role !== "admin" || !item) return;

    const staffId = $("adminAssignStaff").value || null;
    let status = $("adminUpdateStatus").value;
    const remarks = $("adminRemarks").value.trim();

    const previousStaffId = item.assignedStaffId;
    const previousStatus = item.status;

    if (staffId && !users.some(p => p.id === staffId && p.role === "staff"))
        return setError("adminUpdateError", "Select a valid staff member.");
    if (!["Open","Assigned","In Progress","Resolved","Closed"].includes(status))
        return setError("adminUpdateError", "Select a valid complaint status.");

    if (staffId && status === "Open") status = "Assigned";
    if (!staffId && status === "Assigned") status = "Open";
    if (!staffId && ["In Progress","Resolved","Closed"].includes(status))
        return setError("adminUpdateError", "A staff member must be assigned for this status.");

    const history = [...(item.history || []), {
        status,
        message: `Administrator updated complaint assignment/status. ${remarks}`,
        actorId: admin.id,
        date: new Date().toISOString()
    }];

    const { error } = await supabaseClient.from("complaints").update({
        assigned_staff_id: staffId,
        status,
        admin_remarks: remarks || item.adminRemarks || "",
        updated_at: new Date().toISOString(),
        history
    }).eq("id", item.id);
    if (error) return setError("adminUpdateError", error.message);

    if (previousStaffId !== staffId) {
        if (previousStaffId)
            await notify(previousStaffId, `Complaint ${item.id} has been reassigned or removed from your workload.`);
        if (staffId) {
            const newStaffLabel = getStaffLabel(staffId);
            await notify(staffId, `A complaint has been assigned to you: ${item.title} (${item.id}).`);
            await notify(item.userId, `Your complaint has been assigned to ${newStaffLabel}.`);
        } else {
            await notify(item.userId, "Your complaint is currently unassigned.");
        }
    }
    if (remarks)
        await notify(item.userId, `Administrator update for ${item.id}: ${remarks}`);
    if (previousStatus !== status)
        await notify(item.userId, `Your complaint ${item.id} status changed to ${status}.`);

    hide("adminComplaintDetails");
    selectedComplaintId = null;
    await renderApplication();
    navigateTo("admin-complaints");
    toast("Complaint details updated successfully.");
}

/* =========================================================
   ADMIN: UNASSIGNED
========================================================= */

function renderUnassignedComplaints() {
    const tbody = $("unassignedComplaintsBody");
    if (!tbody) return;
    const search = $("assignmentSearch")?.value.trim().toLowerCase() || "";
    const result = complaints
        .filter(c => !c.assignedStaffId)
        .filter(c => ["Open","Assigned"].includes(c.status))
        .filter(c => {
            const t = `${c.id} ${c.title} ${c.category}`;
            return !search || t.toLowerCase().includes(search);
        });
    tbody.innerHTML = "";
    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="6">No unassigned complaints.</td></tr>`;
        return;
    }
    result.forEach(c => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${escapeHTML(c.id)}</td>
            <td>${escapeHTML(c.title)}</td>
            <td>${escapeHTML(c.category)}</td>
            <td>${priorityBadge(c.priority)}</td>
            <td>${formatDate(c.createdAt)}</td>
            <td><button type="button" class="btn btn-small" data-action="assign" data-id="${escapeHTML(c.id)}">Assign Staff</button></td>`;
        tbody.appendChild(row);
    });
}

/* =========================================================
   ADMIN: STAFF MANAGEMENT
========================================================= */

function renderAdminStaff() {
    const container = $("adminStaffList");
    if (!container) return;
    const search = $("adminStaffSearch")?.value.trim().toLowerCase() || "";
    const staff = getStaff().filter(p =>
        `${p.name} ${p.email} ${p.occupation || ""}`.toLowerCase().includes(search)
    );
    if (!staff.length) {
        container.innerHTML = "<p>No staff members found.</p>";
        return;
    }
    container.innerHTML = staff.map(person => {
        const assigned = complaints.filter(c => c.assignedStaffId === person.id);
        const active = assigned.filter(c => !["Resolved","Closed"].includes(c.status)).length;
        const resolved = assigned.length - active;
        return `
            <article class="staff-card">
                <div>
                    <h3>${escapeHTML(person.name)}</h3>
                    <p>${escapeHTML(person.email)}</p>
                    ${person.occupation
                        ? `<span class="staff-meta">${escapeHTML(person.occupation)}</span>`
                        : `<span class="staff-meta">Occupation not specified</span>`}
                </div>
                <div class="staff-stats">
                    <span>Total: <strong>${assigned.length}</strong></span>
                    <span>Active: <strong>${active}</strong></span>
                    <span>Resolved: <strong>${resolved}</strong></span>
                </div>
                <button type="button" class="btn btn-secondary btn-small"
                    data-action="staff-complaints"
                    data-name="${escapeHTML(person.name)}">View Complaints</button>
            </article>`;
    }).join("");
}

/* =========================================================
   ADMIN: REPORTS / CSV
========================================================= */

function renderAdminReports() {
    const container = $("adminReports");
    if (!container) return;
    const statuses = ["Open","Assigned","In Progress","Resolved","Closed"];
    const total = complaints.length;
    container.innerHTML = `
        <div class="report-summary">
            <h3>Total complaints: ${total}</h3>
            <p>Report generated: ${formatDate(new Date().toISOString())}</p>
        </div>
        ${statuses.map(status => {
            const count = complaints.filter(c => c.status === status).length;
            const percent = total ? Math.round(count / total * 100) : 0;
            return `
                <div class="report-row">
                    <span>${status}</span>
                    <strong>${count}</strong>
                    <span>${percent}%</span>
                </div>`;
        }).join("")}`;
}

function exportCSV() {
    const headers = [
        "Complaint ID","Title","Category","Priority","Status","User",
        "Assigned Staff","Staff Occupation","Description","Created At","Updated At"
    ];
    const rows = complaints.map(c => [
        c.id, c.title, c.category, c.priority, c.status,
        getUserName(c.userId),
        c.assignedStaffId ? getUserName(c.assignedStaffId) : "Not assigned",
        getStaffOccupation(c.assignedStaffId) || "",
        c.description, c.createdAt, c.updatedAt
    ]);
    const csv = [headers, ...rows].map(row =>
        row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "TicketDesk_Complaint_Report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Report exported successfully.");
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

function renderNotifications(role) {
    const user = currentUser();
    if (!user || user.role !== role) return;
    const listId = `${role}NotificationsList`;
    const emptyId = role === "user"
        ? "emptyNotificationsMessage"
        : role === "staff"
            ? "staffEmptyNotifications"
            : "adminEmptyNotifications";
    const container = $(listId);
    if (!container) return;
    const items = userNotifications(user.id);
    container.innerHTML = "";
    if (!items.length) { show(emptyId); return; }
    hide(emptyId);
    items.forEach(item => {
        const el = document.createElement("article");
        el.className = `notification-item ${item.read ? "read" : "unread"}`;
        const message = document.createElement("p");
        message.textContent = item.message;
        const date = document.createElement("small");
        date.textContent = formatDate(item.createdAt);
        el.append(message, date);
        container.appendChild(el);
    });
    // mark read in supabase (async, fire and forget)
    supabaseClient.from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .then(() => {
            notifications = notifications.map(n =>
                n.userId === user.id ? { ...n, read: true } : n
            );
        });
}

/* =========================================================
   PROFILE
========================================================= */

function renderProfileFields(role, user) {
    const prefix = role === "user" ? "profile" :
        role === "staff" ? "staffProfile" : "adminProfile";
    const name = $(`${prefix}Name`);
    const email = $(`${prefix}Email`);
    if (name) name.value = user.name;
    if (email) email.value = user.email;
    if (role === "user") {
        setText("profileRole", user.role);
        setText("profileCreatedAt", formatDate(user.created_at || user.createdAt));
    } else {
        setText(`${prefix}Role`, role === "admin" ? "Administrator" : "Staff");
        setText(`${prefix}CreatedAt`, formatDate(user.created_at || user.createdAt));
    }
    if (role === "staff") {
        const occ = $("staffProfileOccupation");
        if (occ) occ.value = user.occupation || "Not specified";
    }
}

function renderUserProfile() { const u = currentUser(); if (u) renderProfileFields("user", u); }
function renderStaffProfile() { const u = currentUser(); if (u) renderProfileFields("staff", u); }
function renderAdminProfile() { const u = currentUser(); if (u) renderProfileFields("admin", u); }

async function updateProfile(event) {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;
    const prefix = user.role === "user" ? "profile" :
        user.role === "staff" ? "staffProfile" : "adminProfile";
    const name = $(`${prefix}Name`)?.value.trim() || "";
    const errorId = user.role === "user" ? "profileError" :
        user.role === "staff" ? "staffProfileError" : "adminProfileError";
    setError(errorId);
    if (!name) return setError(errorId, "Name cannot be empty.");

    const { error } = await supabaseClient.from("users")
        .update({ name }).eq("id", user.id);
    if (error) return setError(errorId, error.message);

    await renderApplication();
    toast("Profile updated successfully.");
}

/* =========================================================
   START
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}
