const {
    State, Pages, App, Cart,
    isCustomer, isRestaurantApproved
} = window;

Pages.Home = {
    init() { Pages.Home.render(); },
    render() {
        const grid = document.getElementById("restaurant-grid");
        const empty = document.getElementById("restaurant-empty");
        const q = (document.getElementById("search-input")?.value || "").toLowerCase();
        const list = State.restaurants
            .filter(r => !isCustomer() || isRestaurantApproved(r))
            .filter(r => r.name.toLowerCase().includes(q) || (r.cuisine || "").toLowerCase().includes(q));
        if (!list.length) { grid.innerHTML = ""; empty.style.display = "flex"; return; }
        empty.style.display = "none";
        grid.innerHTML = list.map(r => `
      <div class="restaurant-card" onclick="App.showPage('restaurant');Pages.Restaurant.load('${r.id}')">
        <div class="restaurant-card-img">
          ${r.image
                ? `<img src="${r.image}" alt="${r.name}" onerror="this.parentElement.innerHTML='<div class=no-img><svg width=40 height=40 viewBox=&quot;0 0 24 24&quot; fill=none stroke=currentColor stroke-width=1.5><path d=&quot;M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4&quot;/></svg></div>'" />`
                : `<div class="no-img"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div>`
            }
          <div class="restaurant-rating">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#f0c040" stroke-width="1.5"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
            ${(r.rating || 5).toFixed(1)}
          </div>
        </div>
        <div class="restaurant-card-body">
          <div class="restaurant-card-head">
            <h3>${r.name}</h3>
            <span class="cuisine-tag">${r.cuisine || ""}</span>
          </div>
          <p class="restaurant-desc">${r.description || ""}</p>
          <div class="restaurant-meta">
            <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${r.deliveryTime || ""}</span>
            <span>Delivery $${(r.deliveryFee || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>`).join("");
    },
    filter() { Pages.Home.render(); }
};

Pages.Restaurant = {
    restaurant: null,
    load(id) {
        const r = State.restaurants.find(r => r.id === id) || null;
        if (isCustomer() && r && !isRestaurantApproved(r)) {
            alert("This restaurant is not available yet.");
            return App.showPage("home");
        }
        Pages.Restaurant.restaurant = r;
        Pages.Restaurant.init();
    },
    init() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        State.selectedRestaurant = r;
        document.getElementById("rdetail-img").src = r.image || "";
        document.getElementById("rdetail-img").alt = r.name;
        document.getElementById("rdetail-name").textContent = r.name;
        document.getElementById("rdetail-rating-val").textContent = (r.rating || 5).toFixed(1);
        document.getElementById("rdetail-time").textContent = r.deliveryTime || "";
        document.getElementById("rdetail-fee").textContent = `Delivery $${(r.deliveryFee || 0).toFixed(2)}`;
        const categories = [...new Set((r.menu || []).map(i => i.category))];
        State.selectedCategory = categories[0] || "";
        const catBar = document.getElementById("category-bar");
        catBar.innerHTML = categories.map(c =>
            `<button class="cat-btn${c === State.selectedCategory ? " active" : ""}" onclick="Pages.Restaurant.selectCategory('${c}')">${c}</button>`
        ).join("");
        Pages.Restaurant.renderMenu();
    },
    selectCategory(cat) {
        State.selectedCategory = cat;
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("active", b.textContent === cat));
        Pages.Restaurant.renderMenu();
    },
    renderMenu() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        const items = (r.menu || []).filter(i => i.category === State.selectedCategory);
        document.getElementById("menu-list").innerHTML = items.map(item => {
            const qty = (State.cart.find(ci => ci.id === item.id) || {}).qty || 0;
            return `
        <div class="menu-item" id="menu-item-${item.id}">
          <div class="menu-item-img">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" onerror="this.parentElement.innerHTML='<svg width=24 height=24 viewBox=&quot;0 0 24 24&quot; fill=none stroke=currentColor stroke-width=1.5><path d=&quot;M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z&quot;/></svg>'" />` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`}
          </div>
          <div class="menu-item-body">
            <h3>${item.name}</h3>
            <p>${item.description || ""}</p>
            <span class="menu-item-price">$${item.price.toFixed(2)}</span>
          </div>
          <div class="qty-control" id="qty-ctrl-${item.id}">
            ${qty > 0 ? `<button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button><span class="qty-num">${qty}</span>` : ""}
            <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify({ ...item, restaurantId: r.id, restaurantName: r.name }).replace(/"/g, '&quot;')})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>
        </div>`;
        }).join("") || `<div class="empty-state"><p>No items in this category</p></div>`;
    },
    updateQtyControls() {
        const r = Pages.Restaurant.restaurant;
        if (!r) return;
        (r.menu || []).filter(i => i.category === State.selectedCategory).forEach(item => {
            const ctrl = document.getElementById("qty-ctrl-" + item.id);
            if (!ctrl) return;
            const qty = (State.cart.find(ci => ci.id === item.id) || {}).qty || 0;
            ctrl.innerHTML = `
        ${qty > 0 ? `<button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button><span class="qty-num">${qty}</span>` : ""}
        <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify({ ...item, restaurantId: r.id, restaurantName: r.name }).replace(/"/g, '&quot;')})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg>
        </button>`;
        });
    }
};
