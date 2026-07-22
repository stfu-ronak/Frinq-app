# Frinq App

Frinq full-stack application repository containing both the frontend and backend services.

## Project Structure

```
.
├── frinq-backend/   # FastAPI Backend Service
└── frinq-frontend/  # Next.js Frontend Application
```

## Getting Started

### Backend (`frinq-backend`)
1. Navigate to `frinq-backend`
2. Create and activate Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/Mac:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and set environment variables.
5. Run dev server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend (`frinq-frontend`)
1. Navigate to `frinq-frontend`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and set environment variables.
4. Run dev server:
   ```bash
   npm run dev
   ```
