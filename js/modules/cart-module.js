const {
    State, Pages, Cart, UI,
    fbAddOrder, isCustomer, isRestaurantApproved
} = window;

Object.assign(Cart, {
    add(item) {
        const normalized = {
            ...item,
            id: String(item?.id || ""),
            name: item?.name || "Item",
            price: Number(item?.price ?? 0),
            qty: 1,
            restaurantId: item?.restaurantId || "",
            restaurantName: item?.restaurantName || "",
            image: item?.image || ""
        };
        if (!normalized.id) return;
        const cartRestaurantId = State.cart[0]?.restaurantId;
        if (cartRestaurantId && normalized.restaurantId && cartRestaurantId !== normalized.restaurantId) {
            Toast.error("You can only order from one restaurant at a time. Please finish or clear your current cart first.");
            return;
        }

        const ex = State.cart.find(i => i.id === normalized.id);
        if (ex) {
            ex.qty = Number(ex.qty || 0) + 1;
            if (!Number.isFinite(Number(ex.price)) || Number(ex.price) === 0) {
                ex.price = normalized.price;
            }
            if (!ex.name) ex.name = normalized.name;
        } else {
            State.cart.push(normalized);
        }
        UI.updateCartBadge();
        Pages.Restaurant.updateQtyControls();
    },
    updateQty(id, delta) {
        const item = State.cart.find(i => i.id === id);
        if (!item) return;
        item.qty = Number(item.qty || 0) + delta;
        if (item.qty <= 0) State.cart = State.cart.filter(i => i.id !== id);
        UI.updateCartBadge();
        if (State.currentPage === "cart") Pages.Cart.init();
        else Pages.Restaurant.updateQtyControls();
    },
    selectPayment(method) {
        State.cartPayment = method;
        document.getElementById("pay-cash-label").classList.toggle("selected", method === "cash");
        document.getElementById("pay-card-label").classList.toggle("selected", method === "card");
        document.getElementById("card-fields").style.display = method === "card" ? "block" : "none";
    },

    async placeOrder() {
        const restaurant = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
        if (!restaurant || !State.cart.length) return;
        const mixedRestaurants = new Set(State.cart.map(i => i.restaurantId).filter(Boolean));
        if (mixedRestaurants.size > 1) {
            Toast.error("Your cart has items from multiple restaurants. Please keep one restaurant per order.");
            return;
        }
        if (isCustomer() && !isRestaurantApproved(restaurant)) {
            Toast.error("This restaurant is not available yet.");
            return;
        }
        if (State.cartPayment === "card") {
            const rawCard = document.getElementById("card-number")?.value || "";
            const rawExpiry = document.getElementById("card-expiry")?.value || "";
            const rawCvv = document.getElementById("card-cvv")?.value || "";
            const cardDigits = rawCard.replace(/\D/g, "");
            const cvvDigits = rawCvv.replace(/\D/g, "");
            const expiryMatch = rawExpiry.match(/^(\d{2})\/(\d{2})$/);
            const month = expiryMatch ? Number(expiryMatch[1]) : 0;

            if (cardDigits.length < 13 || cardDigits.length > 19) {
                return Toast.error("Please enter a valid card number.");
            }
            if (!expiryMatch || month < 1 || month > 12) {
                return Toast.error("Please enter a valid expiry in MM/YY format.");
            }
            if (cvvDigits.length < 3 || cvvDigits.length > 4) {
                return Toast.error("Please enter a valid CVV.");
            }
        }
        UI.setBtnLoading("place-order-btn", true, "Placing order…");
        const orderData = {
            customerId: State.user.id, customerName: State.user.name,
            ownerId: restaurant.ownerId, restaurantId: restaurant.id, restaurantName: restaurant.name,
            items: State.cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, image: i.image || "" })),
            total: parseFloat(Cart.total.toFixed(2)),
            payment: State.cartPayment, status: "Pending", statusIndex: 0,
            address: State.user.address || "No address set",
        };
        await fbAddOrder(orderData);
        State.cart = [];
        UI.updateCartBadge();
        UI.setBtnLoading("place-order-btn", false, "Place order");
        document.getElementById("cart-content").style.display = "none";
        document.getElementById("cart-empty").style.display = "none";
        document.getElementById("cart-success").style.display = "block";
    }
});

Object.defineProperties(Cart, {
    count: {
        get() {
            return State.cart.reduce((a, i) => a + Number(i.qty || 0), 0);
        }
    },
    subtotal: {
        get() {
            return State.cart.reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 0), 0);
        }
    },
    deliveryFee: {
        get() {
            const r = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
            return Number(r?.deliveryFee || 0);
        }
    },
    total: {
        get() {
            return Cart.subtotal + Cart.deliveryFee;
        }
    }
});

document.getElementById("card-number")?.addEventListener("input", e => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
    e.target.value = digits.replace(/(.{4})/g, "$1 ").trim();
});

document.getElementById("card-expiry")?.addEventListener("input", e => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
    e.target.value = digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
});

document.getElementById("card-cvv")?.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
});
