document.addEventListener("DOMContentLoaded", () => {
    const BASE_URL = window.location.origin;
    const config = {
        inputStream: {
            type: "LiveStream",
            target: document.querySelector("#scanner-video"),
            constraints: { facingMode: "environment" }
        },
        decoder: {
            readers: ["ean_reader", "code_128_reader", "upc_reader"]
        },
        locator: {
            patchSize: "medium",
            halfSample: true
        },
        numOfWorkers: 2,
        locate: true
    };

    const startBtn = document.getElementById("start-btn");
    const stopBtn = document.getElementById("stop-btn");
    const checkoutBtn = document.getElementById("checkout-btn");
    const clearBtn = document.getElementById("clear-btn");
    const resultDiv = document.getElementById("result");
    const statusDiv = document.getElementById("status");
    const cartBody = document.getElementById("cart-body");
    const totalDiv = document.getElementById("total");
    const productForm = document.getElementById("product-form");
    const cartAddForm = document.getElementById("cart-add-form");
    const productSelect = document.getElementById("product-select");
    const cartQuantity = document.getElementById("cart-quantity");
    let isScanning = false;
    let cart = [];
    let currentStream = null;
    let products = [];

    initializeScanner();
    refreshProducts().catch(error => showError(error.message));

    function initializeScanner() {
        startBtn.addEventListener("click", () => {
            if (!isScanning) {
                statusDiv.textContent = "Requesting camera...";
                navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                    .then(stream => {
                        currentStream = stream;
                        startScanner(stream);
                        startBtn.style.display = "none";
                        stopBtn.style.display = "inline-block";
                    })
                    .catch(error => showError(`Camera error: ${error.message}`));
            }
        });

        stopBtn.addEventListener("click", stopScanner);
        checkoutBtn.addEventListener("click", checkout);
        clearBtn.addEventListener("click", clearCart);
        productForm.addEventListener("submit", saveProduct);
        cartAddForm.addEventListener("submit", addSelectedProduct);
    }

    async function saveProduct(event) {
        event.preventDefault();
        const formData = new FormData(productForm);
        const product = Object.fromEntries(formData.entries());
        product.barcode = product.barcode.trim();
        product.name = product.name.trim();
        product.buy_price = Number(product.buy_price);
        product.sell_price = Number(product.sell_price);
        product.discount = Number(product.discount);
        product.stock = Number(product.stock);

        try {
            const response = await fetch(`${BASE_URL}/api/products`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || "Could not save product");
            }
            productForm.reset();
            productForm.elements.buy_price.value = "1";
            productForm.elements.discount.value = "0";
            productForm.elements.stock.value = "10";
            try {
                await refreshProducts();
            } catch (error) {
                showError(`Product saved, but the product list could not be refreshed: ${error.message}`);
                return;
            }
            productSelect.value = product.barcode;
            statusDiv.textContent = `Saved ${product.name}. It is ready to add to the cart.`;
            statusDiv.classList.add("success");
            statusDiv.classList.remove("error");
        } catch (error) {
            showError(`Product could not be saved: ${error.message}`);
        }
    }

    async function refreshProducts() {
        try {
            const response = await fetch(`${BASE_URL}/api/products`);
            if (!response.ok) throw new Error("Could not load products");
            products = await response.json();
            const selectedBarcode = productSelect.value;
            productSelect.replaceChildren(new Option("Select a product", ""));
            products.forEach(product => {
                const option = new Option(
                    `${product.name} — ${product.barcode} (PKR ${Number(product.sell_price).toFixed(2)}, stock: ${product.stock})`,
                    product.barcode
                );
                option.disabled = product.stock <= 0;
                productSelect.add(option);
            });
            if (products.some(product => product.barcode === selectedBarcode)) {
                productSelect.value = selectedBarcode;
            }
            if (!products.length) {
                productSelect.options[0].textContent = "No products yet — add one above";
            }
            return true;
        } catch (error) {
            productSelect.replaceChildren(new Option("Unable to load products", ""));
            throw error;
        }
    }

    function addSelectedProduct(event) {
        event.preventDefault();
        const product = products.find(item => item.barcode === productSelect.value);
        const quantity = Number(cartQuantity.value);
        if (!product) {
            showError("Select a product to add.");
            return;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            showError("Quantity must be a whole number greater than zero.");
            return;
        }
        if (addProductToCart(product, quantity)) {
            statusDiv.textContent = `Added ${quantity} × ${product.name} to the cart.`;
            statusDiv.classList.add("success");
            statusDiv.classList.remove("error");
        }
    }

    function startScanner(stream) {
        Quagga.init(config, error => {
            if (error) {
                resultDiv.textContent = `Scanner init error: ${error.message}`;
                showError("Could not start the barcode scanner.");
                startBtn.style.display = "inline-block";
                stopBtn.style.display = "none";
                stream.getTracks().forEach(track => track.stop());
                currentStream = null;
                return;
            }
            Quagga.start();
            isScanning = true;
            resultDiv.textContent = "Scanning for barcodes...";
            statusDiv.textContent = "Scanning...";
            statusDiv.classList.remove("error", "success");
        });

        Quagga.onDetected(data => {
            const barcode = data.codeResult.code;
            resultDiv.textContent = `Detected: ${barcode}`;
            addToCart(barcode);
            stopScanner();
        });
    }

    function stopScanner() {
        if (!isScanning) return;
        Quagga.stop();
        isScanning = false;
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        startBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
    }

    async function addToCart(barcode) {
        try {
            const response = await fetch(`${BASE_URL}/api/products/barcode/${encodeURIComponent(barcode)}`);
            const product = await response.json();
            if (response.status === 404) {
                productForm.elements.barcode.value = barcode;
                productForm.elements.name.focus();
                showError(`Product ${barcode} is not in inventory. Enter its details in Add a New Product.`);
                return;
            }
            if (!response.ok) {
                throw new Error(product.error || "Could not find product");
            }
            if (addProductToCart(product, 1)) {
                statusDiv.textContent = `Added ${product.name} to the cart.`;
                statusDiv.classList.add("success");
                statusDiv.classList.remove("error");
            }
        } catch (error) {
            showError(`Could not add scanned product: ${error.message}`);
        }
    }

    function addProductToCart(product, quantity) {
        const existing = cart.find(item => item.barcode === product.barcode);
        const requestedQuantity = quantity + (existing ? existing.quantity : 0);
        if (requestedQuantity > product.stock) {
            showError(`Only ${product.stock} ${product.name} available in stock.`);
            return false;
        }
        if (existing) {
            existing.quantity = requestedQuantity;
        } else {
            cart.push({
                barcode: product.barcode,
                name: product.name,
                price: Number(product.sell_price),
                discount: Number(product.discount || 0),
                quantity
            });
        }
        updateCartDisplay();
        return true;
    }

    function updateCartDisplay() {
        cartBody.replaceChildren();
        let total = 0;
        cart.forEach(item => {
            const discountedPrice = item.price * (1 - item.discount / 100);
            const subtotal = discountedPrice * item.quantity;
            total += subtotal;
            const row = document.createElement("tr");
            [item.barcode, item.name, `PKR ${discountedPrice.toFixed(2)}`, item.quantity, `PKR ${subtotal.toFixed(2)}`]
                .forEach(value => {
                    const cell = document.createElement("td");
                    cell.textContent = value;
                    row.appendChild(cell);
                });
            cartBody.appendChild(row);
        });
        totalDiv.textContent = `Total: PKR ${total.toFixed(2)}`;
    }

    async function checkout() {
        if (!cart.length) {
            alert("Cart is empty!");
            return;
        }
        try {
            const response = await fetch(`${BASE_URL}/api/transaction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: cart })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Checkout failed");
            showPaymentQR(data.qr_code, data.total);
            cart = [];
            updateCartDisplay();
            statusDiv.textContent = "Checkout complete";
            statusDiv.classList.add("success");
            statusDiv.classList.remove("error");
            try {
                await refreshProducts();
            } catch (error) {
                showError(`Checkout completed, but inventory could not be refreshed: ${error.message}`);
            }
        } catch (error) {
            showError(`Checkout error: ${error.message}`);
        }
    }

    function showPaymentQR(qrBase64, total) {
        const popup = window.open("", "Payment", "width=300,height=400");
        if (!popup) {
            showError("Allow pop-ups to view the payment QR code.");
            return;
        }
        popup.document.write(`
            <html>
            <body style="text-align: center; font-family: Arial;">
                <h2>Payment</h2>
                <p>Total: PKR ${Number(total).toFixed(2)}</p>
                <img src="data:image/png;base64,${qrBase64}" style="width: 200px; height: 200px;">
                <p>Scan with your payment app</p>
                <button onclick="window.close()">Close</button>
            </body>
            </html>
        `);
    }

    function clearCart() {
        cart = [];
        updateCartDisplay();
        statusDiv.textContent = "Cart cleared";
        statusDiv.classList.remove("error", "success");
    }

    function showError(message) {
        statusDiv.textContent = message;
        statusDiv.classList.add("error");
        statusDiv.classList.remove("success");
    }
});
