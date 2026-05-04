const {
    State, App, UI, RESTAURANT_STATUSES,
    fbSetUser, fbAddRestaurant,
    createUserWithEmailAndPassword, serverTimestamp, FB_CONFIGURED, auth
} = window;

window.Apply = {
    currentStep: 1, formData: {},

    // NEW: Real-time feedback for password matching
    validatePasswordMatch() {
        const password = document.getElementById('apply-password').value;
        const confirm = document.getElementById('apply-password-confirm').value;
        const hint = document.getElementById('apply-password-match-hint');
        const confirmField = document.getElementById('apply-password-confirm');

        if (!confirm) {
            hint.style.display = 'none';
            confirmField.style.borderColor = "";
            return;
        }

        if (password === confirm) {
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

    nextStep(step) { 
        if (!window.Apply.validateStep(step)) return; 
        window.Apply.saveStepData(step); 
        window.Apply.currentStep = step + 1; 
        window.Apply.showStep(window.Apply.currentStep); 
        if (window.Apply.currentStep === 4) window.Apply.populateReview(); 
    },

    prevStep(step) { 
        window.Apply.currentStep = step - 1; 
        window.Apply.showStep(window.Apply.currentStep); 
    },

    showStep(stepNum) { 
        document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active')); 
        document.getElementById(`apply-step-${stepNum}`).classList.add('active'); 
        for (let i = 1; i <= 4; i++) { 
            const indicator = document.getElementById(`step-indicator-${i}`); 
            indicator.classList.remove('active', 'completed'); 
            if (i < stepNum) indicator.classList.add('completed'); 
            if (i === stepNum) indicator.classList.add('active'); 
        } 
        document.querySelectorAll('.progress-step.completed .progress-step-circle').forEach(circle => { 
            circle.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>'; 
        }); 
        window.scrollTo(0, 0); 
    },

    validateStep(step) { 
        const errorEl = document.getElementById(`apply-error-${step}`); 
        errorEl.style.display = 'none'; 

        if (step === 1) { 
            const name = document.getElementById('apply-restaurant-name').value.trim(); 
            const cuisine = document.getElementById('apply-cuisine').value.trim(); 
            const phone = document.getElementById('apply-phone').value.trim(); 
            const address = document.getElementById('apply-address').value.trim(); 
            if (!name || !cuisine || !phone || !address) { 
                errorEl.textContent = 'Please fill in all required fields.'; 
                errorEl.style.display = 'block'; 
                return false; 
            } 
        } 

        if (step === 2) { 
            const name = document.getElementById('apply-owner-name').value.trim(); 
            const email = document.getElementById('apply-email').value.trim(); 
            const password = document.getElementById('apply-password').value;
            const confirm = document.getElementById('apply-password-confirm').value; // Added

            if (!name || !email || !password || !confirm) { 
                errorEl.textContent = 'Please fill in all required fields.'; 
                errorEl.style.display = 'block'; 
                return false; 
            } 
            if (password.length < 6) { 
                errorEl.textContent = 'Password must be at least 6 characters.'; 
                errorEl.style.display = 'block'; 
                return false; 
            }
            // Added password match validation
            if (password !== confirm) {
                errorEl.textContent = 'Passwords do not match.';
                errorEl.style.display = 'block';
                return false;
            }
        } 
        return true; 
    },

    saveStepData(step) { 
        if (step === 1) { 
            window.Apply.formData.restaurantName = document.getElementById('apply-restaurant-name').value.trim(); 
            window.Apply.formData.cuisine = document.getElementById('apply-cuisine').value.trim(); 
            window.Apply.formData.phone = document.getElementById('apply-phone').value.trim(); 
            window.Apply.formData.address = document.getElementById('apply-address').value.trim(); 
            window.Apply.formData.description = document.getElementById('apply-description').value.trim(); 
        } 
        if (step === 2) { 
            window.Apply.formData.ownerName = document.getElementById('apply-owner-name').value.trim(); 
            window.Apply.formData.email = document.getElementById('apply-email').value.trim(); 
            window.Apply.formData.password = document.getElementById('apply-password').value; 
        } 
        if (step === 3) { 
            window.Apply.formData.deliveryTime = document.getElementById('apply-delivery-time').value.trim(); 
            window.Apply.formData.deliveryFee = parseFloat(document.getElementById('apply-delivery-fee').value) || 2.99; 
            window.Apply.formData.coverImage = document.getElementById('apply-cover-image').value.trim(); 
        } 
    },

    populateReview() { 
        document.getElementById('review-name').textContent = window.Apply.formData.restaurantName; 
        document.getElementById('review-cuisine').textContent = window.Apply.formData.cuisine; 
        document.getElementById('review-phone').textContent = window.Apply.formData.phone; 
        document.getElementById('review-address').textContent = window.Apply.formData.address; 
        document.getElementById('review-owner').textContent = window.Apply.formData.ownerName; 
        document.getElementById('review-email').textContent = window.Apply.formData.email; 
        document.getElementById('review-time').textContent = window.Apply.formData.deliveryTime; 
        document.getElementById('review-fee').textContent = `$${window.Apply.formData.deliveryFee.toFixed(2)}`; 
    },

    async submit() {
        const errorEl = document.getElementById('apply-error-4'); 
        errorEl.style.display = 'none'; 
        UI.setBtnLoading('apply-submit-btn', true, 'Creating account…');
        try {
            if (!FB_CONFIGURED) throw new Error("Firebase is not configured.");
            const cred = await createUserWithEmailAndPassword(auth, window.Apply.formData.email, window.Apply.formData.password);
            const userProfile = { name: window.Apply.formData.ownerName, email: window.Apply.formData.email, role: 'owner', phone: window.Apply.formData.phone, address: window.Apply.formData.address, restaurantId: '', createdAt: serverTimestamp() };
            await fbSetUser(cred.user.uid, userProfile);
            const restaurantData = { ownerId: cred.user.uid, status: RESTAURANT_STATUSES.pending, name: window.Apply.formData.restaurantName, cuisine: window.Apply.formData.cuisine, address: window.Apply.formData.address, description: window.Apply.formData.description, deliveryTime: window.Apply.formData.deliveryTime, deliveryFee: window.Apply.formData.deliveryFee, image: window.Apply.formData.coverImage, rating: 5.0, submittedAt: serverTimestamp(), submittedBy: { name: window.Apply.formData.ownerName, email: window.Apply.formData.email, phone: window.Apply.formData.phone, address: window.Apply.formData.address }, menu: [] };
            const restaurantId = await fbAddRestaurant(restaurantData);
            await fbSetUser(cred.user.uid, { restaurantId });
            State.user = { id: cred.user.uid, ...userProfile, restaurantId };
            await App.setUser(State.user);
            UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
            window.Apply.reset();
            App.showPage('owner');
        } catch (e) {
            let msg = e.message || 'Could not create account.';
            if (msg.includes('email-already-in-use')) msg = 'This email is already registered. Try logging in instead.';
            errorEl.textContent = msg; 
            errorEl.style.display = 'block'; 
            UI.setBtnLoading('apply-submit-btn', false, 'Submit Application');
        }
    },

    reset() { 
        window.Apply.currentStep = 1; 
        window.Apply.formData = {}; 
        window.Apply.showStep(1); 
        document.querySelectorAll('#page-apply input').forEach(input => { 
            if (input.type === 'number') input.value = input.defaultValue || ''; 
            else input.value = ''; 
        }); 
        document.querySelectorAll('#page-apply .alert').forEach(alert => { 
            alert.style.display = 'none'; 
        }); 
    }
};