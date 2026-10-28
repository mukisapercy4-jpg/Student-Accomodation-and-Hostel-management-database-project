# SAHMS Dashboard Design

Responsive React + Vite dashboard for the Student Accommodation and Hostel Management System.

## Run it
1. Extract the ZIP.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm run dev`
5. Open the localhost URL printed by Vite (normally http://localhost:5173).

## Django API
The dashboard requests `GET http://127.0.0.1:8000/api/hostels/` by default. You can override the API base by copying `.env.example` to `.env` and changing `VITE_API_BASE_URL`.

Add this to Django `settings.py` for local development, and ensure `corsheaders.middleware.CorsMiddleware` is before `CommonMiddleware`:
```python
CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
```

Hostel cards use real API data when available; otherwise, they show clearly noted preview data. Occupancy percentages and booking rows are demonstration values until their respective APIs are connected.

## Scope
This is the finished dashboard frontend package, not a complete copy of your existing local repository. It does not include your Django backend, `.env` secrets, MySQL database/data, or original project files. Keep your current project intact and integrate these frontend files into its `frontend` folder. Never share `.env` secrets.
