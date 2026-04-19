# AI Interview Platform

A full-stack AI-powered interview preparation platform built with **Node.js + Express** (backend) and **React + TailwindCSS** (frontend).

---

## Tech Stack

| Layer        | Technology                         |
|--------------|------------------------------------|
| Backend      | Node.js, Express                   |
| Frontend     | React 18, Vite, TailwindCSS        |
| Database     | PostgreSQL                         |
| Auth         | JWT + bcryptjs                     |
| Payment      | Razorpay (UPI, Card, Net Banking)  |
| AI           | OpenAI GPT-4o-mini                 |
| File Storage | Local (`uploads/` directory)       |
| PDF Reports  | pdfkit                             |

---

## Folder Structure

```
interview-platform/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js               # PostgreSQL pool
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT auth middleware
│   │   │   └── subscription.js     # Subscription guard middleware
│   │   ├── routes/
│   │   │   ├── auth.js             # POST /signup, /login, GET /me
│   │   │   ├── plans.js            # GET /plans, /plans/:id
│   │   │   ├── payment.js          # Razorpay create-order + verify
│   │   │   ├── subscriptions.js    # GET /subscriptions/me
│   │   │   ├── resume.js           # Upload / list / delete resume
│   │   │   ├── instructions.js     # Save / get / delete instructions
│   │   │   ├── sessions.js         # Start / ask / end / list sessions
│   │   │   └── report.js           # PDF/TXT report download
│   │   ├── app.js                  # Express app entry point
│   │   └── seed.js                 # Seed runner script
│   ├── schema.sql                  # Database schema
│   ├── seed.sql                    # Seed data (plans + test user)
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── context/AuthContext.jsx
    │   ├── utils/api.js             # Axios instance
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   └── ProtectedRoute.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Signup.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Plans.jsx
    │   │   ├── Payment.jsx
    │   │   ├── ResumeUpload.jsx
    │   │   ├── Instructions.jsx
    │   │   ├── Interview.jsx
    │   │   └── Report.jsx
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
```

---

## Prerequisites

- Node.js v18+
- PostgreSQL 14+
- Razorpay account (test keys from [dashboard.razorpay.com](https://dashboard.razorpay.com))
- OpenAI API key

---

## Setup

### 1. Create PostgreSQL Database

```sql
CREATE DATABASE interview_platform;
```

### 2. Backend Setup

```bash
cd interview-platform/backend
npm install

# Copy and fill env variables
cp .env.example .env
```

Fill in `.env`:
```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=interview_platform
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d
RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXX
OPENAI_API_KEY=sk-XXXXXXXXXXXXXXXX
FRONTEND_URL=http://localhost:5173
UPLOAD_DIR=uploads
```

### 3. Run Database Schema + Seed

```bash
# This creates tables and seeds plans + test user
npm run seed
```

### 4. Start Backend

```bash
npm run dev    # development (nodemon)
# OR
npm start      # production
```

Backend runs at: `http://localhost:5000`

### 5. Frontend Setup

```bash
cd interview-platform/frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

---

## Test User (Pre-seeded)

| Field    | Value                    |
|----------|--------------------------|
| Email    | testuser@example.com     |
| Password | Test@123                 |
| Plan     | Basic (30 days, ACTIVE)  |

> Password is stored as BCrypt hash. Login works immediately after seeding.

---

## API Reference

### Auth
| Method | Endpoint            | Auth | Description         |
|--------|---------------------|------|---------------------|
| POST   | `/api/auth/signup`  | ❌   | Register user       |
| POST   | `/api/auth/login`   | ❌   | Login + get JWT     |
| GET    | `/api/auth/me`      | ✅   | Get current user    |

### Plans
| Method | Endpoint         | Auth | Description       |
|--------|------------------|------|-------------------|
| GET    | `/api/plans`     | ❌   | List all plans    |
| GET    | `/api/plans/:id` | ❌   | Get single plan   |

### Payment (Razorpay)
| Method | Endpoint                     | Auth | Description                     |
|--------|------------------------------|------|---------------------------------|
| POST   | `/api/payment/create-order`  | ✅   | Create Razorpay order           |
| POST   | `/api/payment/verify`        | ✅   | Verify payment + activate sub   |
| GET    | `/api/payment/history`       | ✅   | Payment history                 |

### Subscriptions
| Method | Endpoint               | Auth | Description               |
|--------|------------------------|------|---------------------------|
| GET    | `/api/subscriptions/me`| ✅   | Get active subscription   |

### Resume
| Method | Endpoint             | Auth | Description            |
|--------|----------------------|------|------------------------|
| POST   | `/api/resume/upload` | ✅   | Upload resume file     |
| GET    | `/api/resume`        | ✅   | List uploaded resumes  |
| DELETE | `/api/resume/:id`    | ✅   | Delete a resume        |

### Instructions
| Method | Endpoint            | Auth | Description                  |
|--------|---------------------|------|------------------------------|
| POST   | `/api/instructions` | ✅   | Save / update instructions   |
| GET    | `/api/instructions` | ✅   | Get instructions             |
| DELETE | `/api/instructions` | ✅   | Delete instructions          |

### Sessions (AI — requires active subscription)
| Method | Endpoint                  | Auth | Sub | Description              |
|--------|---------------------------|------|-----|--------------------------|
| POST   | `/api/sessions/start`     | ✅   | ✅  | Start new session        |
| POST   | `/api/sessions/:id/ask`   | ✅   | ✅  | Ask AI a question        |
| POST   | `/api/sessions/:id/end`   | ✅   | ❌  | End session              |
| GET    | `/api/sessions`           | ✅   | ❌  | List all sessions        |
| GET    | `/api/sessions/:id`       | ✅   | ❌  | Session + all logs       |

### Reports
| Method | Endpoint                             | Auth | Description           |
|--------|--------------------------------------|------|-----------------------|
| GET    | `/api/report/:id/download?format=pdf`| ✅   | Download PDF report   |
| GET    | `/api/report/:id/download?format=text`| ✅  | Download TXT report   |
| GET    | `/api/report/:id/preview`            | ✅   | JSON preview          |

---

## Sample Requests

### Signup
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"john","email":"john@example.com","password":"Pass@123"}'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"Test@123"}'
```

### Create Razorpay Order
```bash
curl -X POST http://localhost:5000/api/payment/create-order \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"plan_id":"a1b2c3d4-0000-0000-0000-000000000001"}'
```

### Start Interview Session
```bash
curl -X POST http://localhost:5000/api/sessions/start \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Frontend Interview"}'
```

### Ask AI a Question
```bash
curl -X POST http://localhost:5000/api/sessions/<SESSION_ID>/ask \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"question":"Explain the difference between useEffect and useLayoutEffect in React."}'
```

---

## Subscription Plans

| Plan       | Price    | Duration   |
|------------|----------|------------|
| Basic      | ₹2,000   | 1 Month    |
| Standard   | ₹4,000   | 3 Months   |
| Premium    | ₹6,000   | 6 Months   |
| Enterprise | ₹9,000   | 12 Months  |

---

## Subscription Access Control

- **JWT middleware** (`src/middleware/auth.js`) — validates Bearer token on all protected routes.
- **Subscription middleware** (`src/middleware/subscription.js`) — additionally checks for a valid, non-expired `ACTIVE` subscription before allowing AI session start and question asking.
- If no active subscription → `403 Forbidden`.

---

## Notes

- Resume files are stored locally in the `uploads/` directory. For production, replace with S3 (`@aws-sdk/client-s3`).
- OpenAI model is set to `gpt-4o-mini` for cost efficiency. Change in `src/routes/sessions.js`.
- Razorpay test mode: use test card `4111 1111 1111 1111` or any UPI test ID.
