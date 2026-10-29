# SAHMS Production Deployment Guide
**Stack: TiDB Cloud Serverless (MySQL) + Render (Django API) + Vercel (React Frontend)**

This guide walks you through deploying the Student Accommodation and Hostel Management System to production using reliable free-tier services.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│     Vercel (React Frontend)     │  Static SPA, CDN cached, automatic HTTPS
└────────────────┬────────────────┘
                 │  REST API calls (HTTPS)
┌────────────────▼────────────────┐
│     Render (Django Backend)     │  Python Web Service with Gunicorn + WhiteNoise
└────────────────┬────────────────┘
                 │  MySQL Protocol (SSL encrypted)
┌────────────────▼────────────────┐
│   TiDB Cloud / Aiven (MySQL)    │  Fully managed cloud MySQL 8.0 compatible DB
└─────────────────────────────────┘
```

---

## Step 1: Set Up Cloud MySQL (TiDB Cloud Serverless)

TiDB Cloud Serverless offers a free, permanent MySQL-compatible database without requiring a credit card:

1. Go to **[https://tidbcloud.com](https://tidbcloud.com)** and sign up (or sign in with GitHub/Google).
2. Click **Create Cluster** → Choose **Serverless** (Free Tier).
3. Name your cluster (e.g., `sahms-db`) and choose your nearest region.
4. Once created, click **Connect**:
   * Select connection method: **General** or **Python**.
   * Note down your:
     * **Host** (`gateway01...prod.aws.tidbcloud.com`)
     * **Port** (`4000`)
     * **User** (`...root`)
     * **Password**
     * **Database** (`test` or create `student_accommodation`)
5. Click **SQL Editor** in the TiDB Cloud console:
   * Open `sql/01_schema.sql` from this repository, paste the contents into the editor, and click **Run**.
   * Open `sql/02_sample_data.sql`, paste the contents into the editor, and click **Run**.
   *(Your 8 business tables and initial records are now live!)*

---

## Step 2: Deploy Backend on Render

1. Go to **[https://render.com](https://render.com)** and sign in with GitHub.
2. Click **New +** → **Web Service**.
3. Select your repository: `Student-Accomodation-and-Hostel-management-database-project`.
4. Configure the service:
   * **Name**: `sahms-backend` (or your chosen name)
   * **Region**: Nearest to your database
   * **Branch**: `main`
   * **Runtime**: `Python 3`
   * **Build Command**: `./build.sh`
   * **Start Command**: `gunicorn SAHMS.wsgi:application`
   * **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `PYTHON_VERSION` | `3.12.8` | Recommended Python version |
   | `DJANGO_DEBUG` | `False` | Production mode |
   | `DJANGO_SECRET_KEY` | *(Click "Generate" or paste a long random string)* | Production secret |
   | `ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` | Permits your Render domain |
   | `CORS_ALLOW_ALL_VERCEL` | `True` | Allows Vercel frontend to connect |
   | `DB_NAME` | *(Your TiDB database name, e.g. test)* | From Step 1 |
   | `DB_USER` | *(Your TiDB username)* | From Step 1 |
   | `DB_PASSWORD` | *(Your TiDB password)* | From Step 1 |
   | `DB_HOST` | *(Your TiDB host address)* | From Step 1 |
   | `DB_PORT` | `4000` *(or 3306 for Aiven)* | From Step 1 |
   | `DB_SSL` | `True` | Required for cloud MySQL |
6. Click **Deploy Web Service**.
7. Once deployed, open the **Shell** tab in Render and run:
   ```bash
   python manage.py migrate
   python manage.py seed_roles
   python manage.py createsuperuser
   ```
8. Copy your Render service URL (e.g. `https://sahms-backend.onrender.com`).

---

## Step 3: Deploy Frontend on Vercel

1. Go to **[https://vercel.com](https://vercel.com)** and sign in with GitHub.
2. Click **Add New…** → **Project**.
3. Import `Student-Accomodation-and-Hostel-management-database-project`.
4. Configure Project settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click **Edit** and choose `frontend`.
5. Under **Environment Variables**, add:
   | Key | Value |
   | :--- | :--- |
   | `VITE_API_BASE_URL` | `https://your-backend-name.onrender.com/api` |
6. Click **Deploy**.
7. In under a minute, your frontend will be live with a URL like `https://sahms-frontend.vercel.app`!

---

## Verification Checklist

- [ ] Visit `https://your-backend-name.onrender.com/api/health/` (should return HTTP 200 `{"status": "healthy"}`).
- [ ] Open your Vercel frontend URL in your browser.
- [ ] Log in with the superuser created in Step 2.
- [ ] Verify Students, Hostels, Rooms, Bookings, and Payments all load successfully.
