"use strict";

/* =========================================================
   TICKET DESK
   Complete front-end complaint management system
   Roles: User, Staff, Administrator
========================================================= */

const STORAGE = {
    users: "ticketDeskUsers",
    complaints: "ticketDeskComplaints",
    session: "ticketDeskSession",
    notifications: "ticketDeskNotifications"
};

const $ = (id) => document.getElementById(id);

const read = (key, fallback = []) => {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
};

const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

let users = read(STORAGE.users);
let complaints = read(STORAGE.complaints);
let notifications = read(STORAGE.notifications);
let session = read(STORAGE.session, null);

let selectedComplaintId = null;

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

function saveAll() {
    write(STORAGE.users, users);
    write(STORAGE.complaints, complaints);
    write(STORAGE.notifications, notifications);
    write(STORAGE.session, session);
}

function currentUser() {
    return session
        ? users.find(user => user.id === session.userId) || null
        : null;
}

function getComplaint(id) {
    return complaints.find(item => item.id === id);
}

function getStaff() {
    return users.filter(user => user.role === "staff");
}

function getUserName(id) {
    return users.find(user => user.id === id)?.name || "Unknown user";
}

function getStaffName(id) {
    if (!id) return "Not assigned";
    return getUserName(id);
}

function getStaffOccupation(id) {
    if (!id) return "";
    return users.find(user => user.id === id)?.occupation || "";
}

/* Renders "Name (Occupation)" or just "Name" for display in tables */
function getStaffLabel(id) {
    if (!id) return "Not assigned";
    const staffUser = users.find(user => user.id === id);
    if (!staffUser) return "Unknown staff";
    return staffUser.occupation
        ? `${staffUser.name} (${staffUser.occupation})`
        : staffUser.name;
}

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setError(id, message = "") {
    const element = $(id);
    if (element) element.textContent = message;
}

function show(id) {
    const element = $(id);
    if (element) element.hidden = false;
}

function hide(id) {
    const element = $(id);
    if (element) element.hidden = true;
}

function toast(message, type = "success") {
    let element = $("resolveToast");

    if (!element) {
        element = document.createElement("div");
        element.id = "resolveToast";
        element.className = "toast";
        document.body.appendChild(element);
    }

    element.textContent = message;
    element.dataset.type = type;
    element.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        element.classList.remove("show");
    }, 3000);
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

function addHistory(complaint, status, message, actorId) {
    if (!Array.isArray(complaint.history)) {
        complaint.history = [];
    }

    complaint.history.push({
        status,
        message,
        actorId,
        date: new Date().toISOString()
    });

    complaint.updatedAt = new Date().toISOString();
}

function notify(userId, message, type = "info") {
    notifications.push({
        id: makeId("NOT"),
        userId,
        message,
        type,
        createdAt: new Date().toISOString(),
        read: false
    });
}

function userNotifications(userId) {
    return notifications
        .filter(item => item.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* =========================================================
   AUTHENTICATION
========================================================= */

function initializeAuth() {
    $("showRegister")?.addEventListener("click", () => {
        hide("loginSection");
        show("registerSection");
        setError("registerError");
    });

    $("showLogin")?.addEventListener("click", () => {
        hide("registerSection");
        show("loginSection");
        setError("loginError");
    });

    /* NEW: toggle occupation field based on selected role */
    $("registerRole")?.addEventListener("change", toggleOccupationField);

    $("loginForm")?.addEventListener("submit", login);
    $("registerForm")?.addEventListener("submit", register);
}

/* NEW: show occupation input only for staff accounts */
function toggleOccupationField() {
    const roleSelect = $("registerRole");
    const group = $("registerOccupationGroup");
    const input = $("registerOccupation");

    if (!roleSelect || !group) return;

    const isStaff = roleSelect.value === "staff";
    group.hidden = !isStaff;

    if (input) {
        input.required = isStaff;
        if (!isStaff) input.value = "";
    }
}

function register(event) {
    event.preventDefault();
    setError("registerError");

    const name = $("registerName").value.trim();
    const email = emailFormat($("registerEmail").value);
    const password = $("registerPassword").value;
    const confirmation = $("confirmPassword").value;
    const role = $("registerRole").value;
    const occupation = $("registerOccupation")?.value.trim() || "";

    if (!name || !email || !password || !confirmation) {
        return setError("registerError", "Complete all required fields.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return setError("registerError", "Enter a valid email address.");
    }

    if (password.length < 8) {
        return setError("registerError", "Password must contain at least 8 characters.");
    }

    if (password !== confirmation) {
        return setError("registerError", "Passwords do not match.");
    }

    if (!["user", "staff", "admin"].includes(role)) {
        return setError("registerError", "Select a valid account role.");
    }

    if (role === "staff" && !occupation) {
        return setError("registerError", "Occupation is required for staff accounts.");
    }

    if (users.some(user => user.email === email)) {
        return setError("registerError", "This email is already registered.");
    }

    users.push({
        id: makeId("USR"),
        name,
        email,
        password,
        role,
        occupation: role === "staff" ? occupation : "",
        createdAt: new Date().toISOString()
    });

    saveAll();

    $("registerForm").reset();
    hide("registerSection");
    show("loginSection");

    $("loginEmail").value = email;

    /* Reset occupation field visibility after successful registration */
    const occGroup = $("registerOccupationGroup");
    if (occGroup) occGroup.hidden = true;

    toast("Account created successfully. Please sign in.");
}

function login(event) {
    event.preventDefault();
    setError("loginError");

    const email = emailFormat($("loginEmail").value);
    const password = $("loginPassword").value;
    const role = $("loginRole").value;

    const accountExists = users.some(user => user.email === email);

    if (!accountExists) {
        return setError("loginError", "Account does not exist.");
    }

    const user = users.find(item =>
        item.email === email &&
        item.password === password &&
        item.role === role
    );

    if (!user) {
        return setError("loginError", "Invalid login credentials.");
    }

    session = {
        userId: user.id,
        loginAt: new Date().toISOString()
    };

    saveAll();
    renderApplication();
}

function logout() {
    session = null;
    selectedComplaintId = null;

    saveAll();

    document.querySelectorAll(".app-shell").forEach(element => {
        element.hidden = true;
    });

    show("authScreen");
    $("loginForm")?.reset();

    toast("You have been logged out.");
}

/* =========================================================
   PAGE NAVIGATION
========================================================= */

function navigateTo(pageId) {
    const page = $(pageId);

    if (!page || !page.classList.contains("page-section")) return;

    const dashboard = page.closest(".app-shell");

    if (!dashboard || dashboard.hidden) return;

    dashboard.querySelectorAll(".page-section").forEach(section => {
        section.hidden = true;
        section.classList.remove("active");
    });

    page.hidden = false;
    page.classList.add("active");

    dashboard.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle("active", button.dataset.page === pageId);
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
   APPLICATION STARTUP
========================================================= */

function renderApplication() {
    const user = currentUser();

    if (!user) {
        session = null;
        saveAll();

        document.querySelectorAll(".app-shell").forEach(element => {
            element.hidden = true;
        });

        show("authScreen");
        return;
    }

    hide("authScreen");

    document.querySelectorAll(".app-shell").forEach(element => {
        element.hidden = element.dataset.dashboard !== user.role;
    });

    if (user.role === "user") {
        renderUserDashboard(user);
        navigateTo("user-overview");
    }

    if (user.role === "staff") {
        renderStaffDashboard(user);
        navigateTo("staff-overview");
    }

    if (user.role === "admin") {
        renderAdminDashboard(user);
        navigateTo("admin-overview");
    }
}

function initialize() {
    initializeAuth();
    initializeNavigation();
    initializeUserFeatures();
    initializeStaffFeatures();
    initializeAdminFeatures();
    initializeLogout();

    renderApplication();
}

/* =========================================================
   LOGOUT
========================================================= */

function initializeLogout() {
    [
        "userLogoutButton",
        "staffLogoutButton",
        "adminLogoutButton"
    ].forEach(id => {
        $(id)?.addEventListener("click", logout);
    });
}

/* =========================================================
   USER DASHBOARD
========================================================= */

function renderUserDashboard(user) {
    const own = complaints.filter(item => item.userId === user.id);

    setText("userWelcome", user.name);

    setText("totalTicketsCount", own.length);

    setText("openTicketsCount", own.filter(item =>
        ["Open", "Assigned"].includes(item.status)
    ).length);

    setText("progressTicketsCount", own.filter(item =>
        item.status === "In Progress"
    ).length);

    setText("resolvedTicketsCount", own.filter(item =>
        ["Resolved", "Closed"].includes(item.status)
    ).length);

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
        hide("ticketDetailsSection");
        selectedComplaintId = null;
    });

    $("cancelEditTicketButton")?.addEventListener("click", () => {
        hide("editTicketSection");
    });

    $("userTicketsTableBody")?.addEventListener("click", handleUserComplaintActions);
}

function createComplaint(event) {
    event.preventDefault();
    setError("createTicketError");

    const user = currentUser();
    if (!user || user.role !== "user") return;

    const title = $("ticketTitle").value.trim();
    const category = $("ticketCategory").value;
    const priority = $("ticketPriority").value;
    const contact = $("ticketContact").value.trim();
    const description = $("ticketDescription").value.trim();

    if (!title || !category || !description) {
        return setError("createTicketError", "Complete all required fields.");
    }

    const complaint = {
        id: makeId(),
        userId: user.id,
        title,
        category,
        priority,
        contact,
        description,
        status: "Open",
        assignedStaffId: null,
        staffResponse: "",
        adminRemarks: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: []
    };

    addHistory(complaint, "Open", "Complaint submitted by user.", user.id);

    complaints.push(complaint);

    notify(
        user.id,
        `Your complaint ${complaint.id} has been submitted successfully.`,
        "success"
    );

    users.filter(item => item.role === "admin").forEach(admin => {
        notify(
            admin.id,
            `New complaint submitted: ${complaint.title} (${complaint.id}).`
        );
    });

    saveAll();

    $("createTicketForm").reset();

    renderApplication();
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
        .filter(item => item.userId === user.id)
        .filter(item => {
            const text = `${item.id} ${item.title} ${item.category} ${item.description}`;
            return !search || text.toLowerCase().includes(search);
        })
        .filter(item => !status || item.status === status)
        .filter(item => !priority || item.priority === priority)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderUserComplaints() {
    const tbody = $("userTicketsTableBody");
    if (!tbody) return;

    const result = filteredUserComplaints();

    tbody.innerHTML = "";

    if (!result.length) {
        tbody.innerHTML = `
            <tr><td colspan="8">No complaints found.</td></tr>
        `;
        return;
    }

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${escapeHTML(getStaffLabel(item.assignedStaffId))}</td>
            <td>${formatDate(item.createdAt)}</td>
            <td>
                <button type="button" class="btn btn-small"
                    data-action="view" data-id="${escapeHTML(item.id)}">View</button>
                <button type="button" class="btn btn-small"
                    data-action="edit" data-id="${escapeHTML(item.id)}">Edit</button>
                <button type="button" class="btn btn-small btn-danger"
                    data-action="delete" data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
        `;

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

    setText(
        "detailStaffResponse",
        item.staffResponse || "No staff update has been submitted."
    );

    show("ticketDetailsSection");

    $("ticketDetailsSection").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function openEditComplaint(id) {
    const user = currentUser();
    const item = getComplaint(id);

    if (!user || !item || item.userId !== user.id) return;

    if (!["Open", "Assigned"].includes(item.status)) {
        return toast("This complaint can no longer be edited.", "error");
    }

    $("editTicketId").value = item.id;
    $("editTicketTitle").value = item.title;
    $("editTicketCategory").value = item.category;
    $("editTicketPriority").value = item.priority;
    $("editTicketDescription").value = item.description;

    setError("editTicketError");
    show("editTicketSection");

    $("editTicketSection").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function editComplaint(event) {
    event.preventDefault();
    setError("editTicketError");

    const user = currentUser();
    const item = getComplaint($("editTicketId").value);

    if (!user || !item || item.userId !== user.id) return;

    if (!["Open", "Assigned"].includes(item.status)) {
        return setError("editTicketError", "This complaint can no longer be edited.");
    }

    const title = $("editTicketTitle").value.trim();
    const category = $("editTicketCategory").value;
    const priority = $("editTicketPriority").value;
    const description = $("editTicketDescription").value.trim();

    if (!title || !category || !description) {
        return setError("editTicketError", "Complete all required fields.");
    }

    Object.assign(item, {
        title,
        category,
        priority,
        description,
        updatedAt: new Date().toISOString()
    });

    addHistory(item, item.status, "Complaint details updated by user.", user.id);

    saveAll();
    hide("editTicketSection");

    renderApplication();
    navigateTo("user-complaints");

    toast("Complaint updated successfully.");
}

function deleteComplaint(id) {
    const user = currentUser();
    const item = getComplaint(id);

    if (!user || !item || item.userId !== user.id) return;

    if (!confirm(`Delete complaint ${id}? This action cannot be undone.`)) return;

    complaints = complaints.filter(complaint => complaint.id !== id);

    if (selectedComplaintId === id) {
        selectedComplaintId = null;
        hide("ticketDetailsSection");
    }

    notify(
        user.id,
        `Complaint ${id} was deleted from your account.`,
        "info"
    );

    saveAll();
    renderApplication();

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
        const button = event.target.closest("[data-action='update']");
        if (!button) return;

        $("staffUpdateComplaintId").value = button.dataset.id;

        $("staffUpdateForm").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });

    $("staffRecentComplaintsBody")?.addEventListener("click", event => {
        const button = event.target.closest("[data-action='update']");
        if (!button) return;

        navigateTo("staff-assigned");
        $("staffUpdateComplaintId").value = button.dataset.id;
    });

    $("staffProfileForm")?.addEventListener("submit", updateProfile);
}

function staffAssigned(user) {
    return complaints.filter(item => item.assignedStaffId === user.id);
}

function renderStaffDashboard(user) {
    const assigned = staffAssigned(user);

    /* NEW: show occupation next to staff name in header */
    setText(
        "staffWelcome",
        user.occupation ? `${user.name} · ${user.occupation}` : user.name
    );

    setText("staffAssignedCount", assigned.length);

    setText("staffProgressCount", assigned.filter(item =>
        item.status === "In Progress"
    ).length);

    setText("staffResolvedCount", assigned.filter(item =>
        ["Resolved", "Closed"].includes(item.status)
    ).length);

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
        .filter(item => {
            const text = `${item.id} ${item.title} ${item.category}`;
            return !search || text.toLowerCase().includes(search);
        })
        .filter(item => !status || item.status === status);

    tbody.innerHTML = "";

    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="6">No assigned complaints.</td></tr>`;
        return;
    }

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>
                <button class="btn btn-small" type="button"
                    data-action="update" data-id="${escapeHTML(item.id)}">
                    Update
                </button>
            </td>
        `;

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

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>
                <button class="btn btn-small" data-action="update"
                    data-id="${escapeHTML(item.id)}" type="button">Update</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

function renderStaffUpdateOptions() {
    const select = $("staffUpdateComplaintId");
    const user = currentUser();

    if (!select || !user) return;

    const previous = select.value;

    select.innerHTML = `<option value="">Select assigned complaint</option>`;

    staffAssigned(user).forEach(item => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = `${item.id} — ${item.title}`;
        select.appendChild(option);
    });

    if ([...select.options].some(option => option.value === previous)) {
        select.value = previous;
    }
}

function submitStaffUpdate(event) {
    event.preventDefault();
    setError("staffUpdateError");

    const user = currentUser();
    if (!user || user.role !== "staff") return;

    const id = $("staffUpdateComplaintId").value;
    const status = $("staffUpdateStatus").value;
    const message = $("staffUpdateMessage").value.trim();

    const item = getComplaint(id);

    if (!item || item.assignedStaffId !== user.id) {
        return setError("staffUpdateError", "Select a complaint assigned to you.");
    }

    if (!["Assigned", "In Progress"].includes(item.status)) {
        return setError("staffUpdateError", "This complaint is already resolved.");
    }

    if (!message) {
        return setError("staffUpdateError", "Enter a progress report.");
    }

    if (!["In Progress", "Resolved"].includes(status)) {
        return setError("staffUpdateError", "Select a valid status.");
    }

    item.status = status;
    item.staffResponse = message;

    addHistory(item, status, message, user.id);

    /* NEW: include staff occupation in admin notification */
    const staffLabel = user.occupation
        ? `${user.name} (${user.occupation})`
        : user.name;

    users.filter(person => person.role === "admin").forEach(admin => {
        notify(
            admin.id,
            `${staffLabel} updated ${item.id}: ${status}. ${message}`
        );
    });

    notify(
        item.userId,
        `Your complaint ${item.id} is now ${status}. ${message}`
    );

    saveAll();

    $("staffUpdateForm").reset();

    renderApplication();
    navigateTo("staff-assigned");

    toast("Progress report submitted successfully.");
}

/* =========================================================
   ADMINISTRATOR DASHBOARD
========================================================= */

function initializeAdminFeatures() {
    $("adminSearch")?.addEventListener("input", renderAdminComplaints);
    $("adminStatusFilter")?.addEventListener("change", renderAdminComplaints);

    $("assignmentSearch")?.addEventListener("input", renderUnassignedComplaints);
    $("adminStaffSearch")?.addEventListener("input", renderAdminStaff);

    $("adminUpdateComplaintForm")?.addEventListener("submit", saveAdminComplaint);

    $("closeAdminComplaintDetails")?.addEventListener("click", () => {
        hide("adminComplaintDetails");
        selectedComplaintId = null;
    });

    $("adminComplaintsBody")?.addEventListener("click", event => {
        const button = event.target.closest("[data-action='manage']");
        if (button) openAdminComplaint(button.dataset.id);
    });

    $("unassignedComplaintsBody")?.addEventListener("click", event => {
        const button = event.target.closest("[data-action='assign']");
        if (button) openAdminComplaint(button.dataset.id);
    });

    $("adminStaffList")?.addEventListener("click", event => {
        const button = event.target.closest("[data-action='staff-complaints']");
        if (!button) return;

        navigateTo("admin-complaints");

        $("adminSearch").value = button.dataset.name || "";
        renderAdminComplaints();
    });

    $("exportReportButton")?.addEventListener("click", exportCSV);

    $("adminProfileForm")?.addEventListener("submit", updateProfile);
}

function renderAdminDashboard(user) {
    setText("adminWelcome", user.name);

    const count = status => complaints.filter(item => item.status === status).length;

    setText("adminTotalCount", complaints.length);
    setText("adminOpenCount", count("Open"));
    setText("adminAssignedCount", count("Assigned"));
    setText("adminProgressCount", count("In Progress"));
    setText("adminResolvedCount",
        count("Resolved") + count("Closed"));

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
        .filter(item => {
            const owner = getUserName(item.userId);
            const assignedStaff = getStaffLabel(item.assignedStaffId);
            const text = `${item.id} ${item.title} ${item.category} ${owner} ${assignedStaff}`;
            return !search || text.toLowerCase().includes(search);
        })
        .filter(item => !status || item.status === status)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    tbody.innerHTML = "";

    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="7">No complaints found.</td></tr>`;
        return;
    }

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(getUserName(item.userId))}</td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${escapeHTML(getStaffLabel(item.assignedStaffId))}</td>
            <td>
                <button type="button" class="btn btn-small"
                    data-action="manage" data-id="${escapeHTML(item.id)}">
                    Manage
                </button>
            </td>
        `;

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

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(getUserName(item.userId))}</td>
            <td>${statusBadge(item.status)}</td>
            <td>${escapeHTML(getStaffLabel(item.assignedStaffId))}</td>
        `;

        tbody.appendChild(row);
    });
}

/* =========================================================
   ADMIN: OPEN COMPLAINT REVIEW
========================================================= */

function openAdminComplaint(id) {
    const item = getComplaint(id);
    const admin = currentUser();

    if (!item || !admin || admin.role !== "admin") return;

    /* The review form is inside the All Complaints page.
       Navigate there before displaying the form. */
    navigateTo("admin-complaints");

    selectedComplaintId = id;

    $("adminComplaintId").value = item.id;

    $("adminComplaintInformation").textContent =
        `${item.title} | Submitted by ${getUserName(item.userId)} | ${item.category} | ${item.priority}`;

    const staffSelect = $("adminAssignStaff");

    staffSelect.innerHTML = `<option value="">Unassigned</option>`;

    /* NEW: include occupation in the staff dropdown labels */
    getStaff().forEach(person => {
        const option = document.createElement("option");

        option.value = person.id;
        option.textContent = person.occupation
            ? `${person.name} — ${person.occupation} (${person.email})`
            : `${person.name} (${person.email})`;

        staffSelect.appendChild(option);
    });

    staffSelect.value = item.assignedStaffId || "";

    $("adminUpdateStatus").value = item.status;
    $("adminRemarks").value = "";

    setError("adminUpdateError");

    show("adminComplaintDetails");

    $("adminComplaintDetails").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* =========================================================
   ADMIN: SAVE ASSIGNMENT AND COMPLAINT UPDATES
========================================================= */

function saveAdminComplaint(event) {
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

    if (staffId && !users.some(person =>
        person.id === staffId && person.role === "staff"
    )) {
        return setError("adminUpdateError", "Select a valid staff member.");
    }

    if (!["Open", "Assigned", "In Progress", "Resolved", "Closed"].includes(status)) {
        return setError("adminUpdateError", "Select a valid complaint status.");
    }

    /* Automatically change Open to Assigned when staff is selected. */
    if (staffId && status === "Open") {
        status = "Assigned";
    }

    /* If staff is removed from an Assigned complaint,
       return the complaint to Open. */
    if (!staffId && status === "Assigned") {
        status = "Open";
    }

    if (!staffId && ["In Progress", "Resolved", "Closed"].includes(status)) {
        return setError(
            "adminUpdateError",
            "A staff member must be assigned for this status."
        );
    }

    item.assignedStaffId = staffId;
    item.status = status;

    if (remarks) {
        item.adminRemarks = remarks;
    }

    /* Notify the previous and newly assigned staff members. */
    if (previousStaffId !== staffId) {
        if (previousStaffId) {
            notify(
                previousStaffId,
                `Complaint ${item.id} has been reassigned or removed from your workload.`
            );
        }

        if (staffId) {
            const newStaffLabel = getStaffLabel(staffId);
            notify(
                staffId,
                `A complaint has been assigned to you: ${item.title} (${item.id}).`
            );
            /* NEW: also include the assigned staff label in the user notification */
            notify(
                item.userId,
                `Your complaint has been assigned to ${newStaffLabel}.`
            );
        } else {
            notify(
                item.userId,
                "Your complaint is currently unassigned."
            );
        }
    }

    /* Record assignment and status changes in complaint history. */
    if (previousStatus !== status || previousStaffId !== staffId) {
        addHistory(
            item,
            status,
            `Administrator updated complaint assignment/status. ${remarks}`,
            admin.id
        );
    } else {
        item.updatedAt = new Date().toISOString();
    }

    /* Notify the user about administrator remarks. */
    if (remarks) {
        notify(
            item.userId,
            `Administrator update for ${item.id}: ${remarks}`
        );
    }

    /* Notify the user about status changes. */
    if (previousStatus !== status) {
        notify(
            item.userId,
            `Your complaint ${item.id} status changed to ${status}.`
        );
    }

    saveAll();

    hide("adminComplaintDetails");
    selectedComplaintId = null;

    renderApplication();
    navigateTo("admin-complaints");

    toast("Complaint details updated successfully.");
}

/* =========================================================
   ADMIN: UNASSIGNED COMPLAINTS
========================================================= */

function renderUnassignedComplaints() {
    const tbody = $("unassignedComplaintsBody");
    if (!tbody) return;

    const search = $("assignmentSearch")?.value.trim().toLowerCase() || "";

    const result = complaints
        .filter(item => !item.assignedStaffId)
        .filter(item => ["Open", "Assigned"].includes(item.status))
        .filter(item => {
            const text = `${item.id} ${item.title} ${item.category}`;
            return !search || text.toLowerCase().includes(search);
        });

    tbody.innerHTML = "";

    if (!result.length) {
        tbody.innerHTML = `<tr><td colspan="6">No unassigned complaints.</td></tr>`;
        return;
    }

    result.forEach(item => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(item.id)}</td>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(item.category)}</td>
            <td>${priorityBadge(item.priority)}</td>
            <td>${formatDate(item.createdAt)}</td>
            <td>
                <button type="button" class="btn btn-small"
                    data-action="assign" data-id="${escapeHTML(item.id)}">
                    Assign Staff
                </button>
            </td>
        `;

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

    const staff = getStaff().filter(person =>
        `${person.name} ${person.email} ${person.occupation || ""}`
            .toLowerCase()
            .includes(search)
    );

    if (!staff.length) {
        container.innerHTML = "<p>No staff members found.</p>";
        return;
    }

    /* NEW: show occupation on each staff card */
    container.innerHTML = staff.map(person => {
        const assigned = complaints.filter(
            item => item.assignedStaffId === person.id
        );

        const active = assigned.filter(item =>
            !["Resolved", "Closed"].includes(item.status)
        ).length;

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
                    data-name="${escapeHTML(person.name)}">
                    View Complaints
                </button>
            </article>
        `;
    }).join("");
}

/* =========================================================
   ADMIN: REPORTS AND CSV EXPORT
========================================================= */

function renderAdminReports() {
    const container = $("adminReports");
    if (!container) return;

    const statuses = ["Open", "Assigned", "In Progress", "Resolved", "Closed"];
    const total = complaints.length;

    container.innerHTML = `
        <div class="report-summary">
            <h3>Total complaints: ${total}</h3>
            <p>Report generated: ${formatDate(new Date().toISOString())}</p>
        </div>

        ${statuses.map(status => {
            const count = complaints.filter(item => item.status === status).length;
            const percent = total ? Math.round(count / total * 100) : 0;

            return `
                <div class="report-row">
                    <span>${status}</span>
                    <strong>${count}</strong>
                    <span>${percent}%</span>
                </div>
            `;
        }).join("")}
    `;
}

function exportCSV() {
    const headers = [
        "Complaint ID",
        "Title",
        "Category",
        "Priority",
        "Status",
        "User",
        "Assigned Staff",
        "Staff Occupation",
        "Description",
        "Created At",
        "Updated At"
    ];

    /* NEW: include staff occupation column in the CSV export */
    const rows = complaints.map(item => [
        item.id,
        item.title,
        item.category,
        item.priority,
        item.status,
        getUserName(item.userId),
        item.assignedStaffId ? getStaffName(item.assignedStaffId) : "Not assigned",
        getStaffOccupation(item.assignedStaffId) || "",
        item.description,
        item.createdAt,
        item.updatedAt
    ]);

    const csv = [headers, ...rows].map(row =>
        row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

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

    if (!items.length) {
        show(emptyId);
        return;
    }

    hide(emptyId);

    items.forEach(item => {
        const element = document.createElement("article");

        element.className =
            `notification-item ${item.read ? "read" : "unread"}`;

        const message = document.createElement("p");
        message.textContent = item.message;

        const date = document.createElement("small");
        date.textContent = formatDate(item.createdAt);

        element.append(message, date);
        container.appendChild(element);
    });

    notifications = notifications.map(item =>
        item.userId === user.id
            ? { ...item, read: true }
            : item
    );

    write(STORAGE.notifications, notifications);
}

/* =========================================================
   PROFILE MANAGEMENT
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
        setText("profileCreatedAt", formatDate(user.createdAt));
    } else {
        setText(`${prefix}Role`, role === "admin" ? "Administrator" : "Staff");
        setText(`${prefix}CreatedAt`, formatDate(user.createdAt));
    }

    /* NEW: populate staff occupation field */
    if (role === "staff") {
        const occ = $("staffProfileOccupation");
        if (occ) occ.value = user.occupation || "Not specified";
    }
}

function renderUserProfile() {
    const user = currentUser();
    if (user) renderProfileFields("user", user);
}

function renderStaffProfile() {
    const user = currentUser();
    if (user) renderProfileFields("staff", user);
}

function renderAdminProfile() {
    const user = currentUser();
    if (user) renderProfileFields("admin", user);
}

function updateProfile(event) {
    event.preventDefault();

    const user = currentUser();
    if (!user) return;

    const prefix = user.role === "user" ? "profile" :
        user.role === "staff" ? "staffProfile" : "adminProfile";

    const name = $(`${prefix}Name`)?.value.trim() || "";

    const errorId = user.role === "user" ? "profileError" :
        user.role === "staff" ? "staffProfileError" : "adminProfileError";

    setError(errorId);

    if (!name) {
        return setError(errorId, "Name cannot be empty.");
    }

    user.name = name;

    saveAll();
    renderApplication();

    toast("Profile updated successfully.");
}

/* =========================================================
   START APPLICATION
========================================================= */

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}