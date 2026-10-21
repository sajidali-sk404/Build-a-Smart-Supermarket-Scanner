# Smart Supermarket Scanner

A browser-based barcode point-of-sale app built with Flask, SQLite, and JavaScript.

## Requirements

- Python 3.10 or newer

## Install and run on Windows

From the project folder, run these commands in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python app.py
```

The app starts only the local Flask server; it does not open a desktop window
or launch a browser. Open `http://127.0.0.1:5000` yourself to use the scanner
page. Stop the server with `Ctrl+C` in the terminal.
Localhost is treated as a secure context by modern browsers, so the scanner can
request camera access without the expired self-signed certificate. QuaggaJS is
loaded from jsDelivr, so the scanner page also needs an internet connection.

The SQLite database and log are stored beside `app.py`, regardless of the
directory from which the app is launched. The included database is used if
present; otherwise it is created at startup.

## Using the scanner page

Use **Add a New Product** to enter a barcode, product name, prices, discount,
and stock. Add an existing item to the cart with the product picker and
quantity field, or scan its barcode. Discounts are included in the displayed
cart total and checkout uses the inventory stock count.
