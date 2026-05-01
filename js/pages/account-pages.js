const { State, Pages, UI, fbSetUser } = window;

Pages.Profile = {
    init() { const u = State.user; if (!u) return; document.getElementById("prof-name").value = u.name || ""; document.getElementById("prof-email").value = u.email || ""; document.getElementById("prof-phone").value = u.phone || ""; document.getElementById("prof-address").value = u.address || ""; document.getElementById("prof-address-field").style.display = u.role === "customer" ? "block" : "none"; document.getElementById("profile-alert").style.display = "none"; },
    async save() {
        const al = document.getElementById("profile-alert");
        UI.setBtnLoading("prof-save-btn", true, "Saving…");
        try {
            if (!State.user?.id) throw new Error("No logged-in user found.");
            const data = { name: document.getElementById("prof-name").value.trim(), email: document.getElementById("prof-email").value.trim(), phone: document.getElementById("prof-phone").value.trim(), address: document.getElementById("prof-address").value.trim() };
            if (!data.name) throw new Error("Name is required.");
            await fbSetUser(State.user.id, data); Object.assign(State.user, data); UI.applyUser();
            al.className = "alert alert-success"; al.textContent = "Changes saved!"; al.style.display = "block"; setTimeout(() => al.style.display = "none", 2500);
        } catch (e) {
            al.className = "alert alert-error"; al.textContent = e.message || "Could not save profile changes."; al.style.display = "block";
        } finally { UI.setBtnLoading("prof-save-btn", false, "Save changes"); }
    }
};

Pages.Settings = { init() { document.getElementById("setting-dark").checked = document.documentElement.getAttribute("data-theme") === "dark"; } };
