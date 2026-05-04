const {
    FB_CONFIGURED, Auth, App, UI,
    fbGetUser, fbSetUser,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, serverTimestamp
} = window;

Object.assign(Auth, {
    currentTab: "login",

    validatePasswordMatch() {
        if (Auth.currentTab !== "register") return;
        
        const password = document.getElementById("auth-password").value;
        const confirmPassword = document.getElementById("auth-password-confirm").value;
        const hint = document.getElementById("password-match-hint");
        const confirmField = document.getElementById("auth-password-confirm");
        
        if (!confirmPassword) {
            hint.style.display = "none";
            confirmField.style.borderColor = "";
            return;
        }
        
        if (password === confirmPassword) {
            hint.textContent = "✓ Passwords match";
            hint.style.color = "var(--green)";
            hint.style.display = "block";
            confirmField.style.borderColor = "var(--green)";
        } else {
            hint.textContent = "✗ Passwords do not match";
            hint.style.color = "var(--red)";
            hint.style.display = "block";
            confirmField.style.borderColor = "var(--red)";
        }
    },

    async submit() {
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;
        const name = document.getElementById("reg-name").value.trim();
        UI.setAuthError("");
        
        if (Auth.currentTab === "register") {
            const confirmPassword = document.getElementById("auth-password-confirm").value;
            if (password !== confirmPassword) {
                Toast.error("Passwords do not match");
                return;
            }
        }
        
        UI.setBtnLoading("auth-submit-btn", true, Auth.currentTab === "login" ? "Signing in…" : "Creating account…");

        try {
            if (!email || !password) throw new Error("Email and password are required.");
            if (Auth.currentTab === "login") {
                await Auth._login(email, password);
            } else {
                if (!name) throw new Error("Please enter your full name.");
                await Auth._register(name, email, password, "customer");
            }
        } catch (e) {
            UI.setAuthError(e.message || "Something went wrong.");
            UI.setBtnLoading("auth-submit-btn", false, Auth.currentTab === "login" ? "Sign in" : "Create account");
        }
    },

    async _login(email, password) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await signInWithEmailAndPassword(window.auth, email, password);
        const profile = await fbGetUser(cred.user.uid);
        if (!profile) throw new Error("User profile not found in Firebase. Please create an account first.");
        await App.setUser(profile);
        UI.setBtnLoading("auth-submit-btn", false, "Sign in");
    },

    async _register(name, email, password, role) {
        if (!FB_CONFIGURED) throw new Error("Firebase is not configured. Please add your Firebase config first.");
        const cred = await createUserWithEmailAndPassword(window.auth, email, password);
        const profile = { name, email, role, phone: "", address: "", restaurantId: "", createdAt: serverTimestamp() };
        await fbSetUser(cred.user.uid, profile);
        await App.setUser({ id: cred.user.uid, ...profile });
        UI.setBtnLoading("auth-submit-btn", false, "Create account");
    }
});