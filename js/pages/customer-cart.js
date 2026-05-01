const { State, Pages, Cart } = window;

Pages.Cart = {
    init() {
        document.getElementById("cart-success").style.display = "none";
        if (!State.cart.length) {
            document.getElementById("cart-empty").style.display = "flex";
            document.getElementById("cart-content").style.display = "none";
            return;
        }
        document.getElementById("cart-empty").style.display = "none";
        document.getElementById("cart-content").style.display = "block";
        const r = State.restaurants.find(r => r.id === State.cart[0]?.restaurantId);
        document.getElementById("cart-restaurant-name").textContent = r?.name || "";
        document.getElementById("cart-items-list").innerHTML = State.cart.map(item => {
            const price = Number(item.price || 0);
            const qty = Number(item.qty || 0);
            return `
      <div class="cart-row">
        <div class="cart-row-info"><p>${item.name || "Item"}</p><span>$${price.toFixed(2)} each</span></div>
        <div class="qty-control">
          <button class="btn-icon" onclick="Cart.updateQty('${item.id}',-1)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12H4"/></svg></button>
          <span class="qty-num">${qty}</span>
          <button class="btn-icon filled" onclick="Cart.add(${JSON.stringify(item).replace(/"/g, '&quot;')})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 4v16m8-8H4"/></svg></button>
        </div>
        <div class="cart-row-price">$${(price * qty).toFixed(2)}</div>
      </div>`;
        }).join("");
        document.getElementById("cart-subtotal").textContent = `$${Cart.subtotal.toFixed(2)}`;
        document.getElementById("cart-delivery").textContent = `$${Cart.deliveryFee.toFixed(2)}`;
        document.getElementById("cart-total").textContent = `$${Cart.total.toFixed(2)}`;
        document.getElementById("place-order-btn").textContent = `Place order — $${Cart.total.toFixed(2)}`;
    }
};
