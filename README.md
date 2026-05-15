# CareConnect

> An agentic AI assistant that helps families in the Swiss IV/EL disability
> benefits system manage care administration — invoice logging, transport
> scheduling, and SVA Form 5050 submission.

Built as a hybrid system:

| Component | Responsibility |
| --- | --- |
| IBM watsonx Orchestrate | Invoice extraction agent, email agent, help agent |
| FastAPI | Backend API bridge — auth, data persistence, WXO proxy |
| React + Vite | Frontend UI |
| Twilio | Automated phone cancellation of TixiTaxi rides |

---

## What It Does

**Invoice Submission** — Upload a transport or meal receipt (photo or PDF).
The WXO invoice extraction agent reads the receipt, classifies the transport
type (OV / Privatauto / Taxi), asks for the appointment reason and provider,
then assembles a validated SVA Form 5050 row for approval.

**Ride Planning** — Create and manage planned transport appointments. Send
a formatted ride list to TixiTaxi by email via the WXO email agent, or cancel
a specific ride by triggering an automated Twilio phone call to the TixiTaxi
cancellation line.

**Invoice Records** — View all logged invoices and planned rides in one
combined list. Filter by category (Transport / Meal), download original
receipts, and edit or delete records.

**Profile** — Store parent and child details (name, AHV number, invoice
address) and account credentials used across the app.

**Help & Guidance** — Conversational chat agent (backed by WXO) that answers
questions about SVA reimbursement rules, Form 5050, TixiTaxi, and how to use
CareConnect. Grounded in a knowledge base of app guides and IV/EL documentation.

---

## Project Structure

```text
careconnect/
├── adk-projects/
│   ├── invoice_extraction_agent/      # WXO ADK agent — receipt reading & Form 5050 assembly
│   │   ├── agent.yaml
│   │   ├── tools.py
│   │   ├── models.py
│   │   └── README.md
│   └── help_agent/                    # WXO ADK agent — conversational help & guidance
│       ├── agent.yaml
│       ├── README.md
│       └── knowledge_base/
│           ├── app_user_guide.md
│           ├── sva_transport_rules.md
│           ├── iv_el_faq.md
│           └── tixitaxi_guide.md
├── backend/
│   ├── main.py                        # FastAPI app, CORS, router registration
│   ├── routes/
│   │   ├── invoice.py                 # Receipt upload, WXO thread management, approval flow
│   │   ├── rides.py                   # Ride CRUD, TixiTaxi email, Twilio cancellation
│   │   ├── invoice_db.py              # Invoice records database and file serving
│   │   ├── profile.py                 # User/child profile read and update
│   │   ├── auth.py                    # Username/password login
│   │   └── help.py                    # Help agent chat session management
│   ├── data/
│   │   ├── invoice_db.json            # Invoice records (auto-created)
│   │   ├── rides.json                 # Planned rides (auto-created)
│   │   ├── profile.json               # User profile (auto-created)
│   │   └── invoice_uploads/           # Uploaded receipt files (auto-created)
│   ├── requirements.txt
│   └── .env                           # Credentials — see Environment Variables below
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── InvoicePage.jsx        # Help & Guidance chat UI (home route)
    │   │   ├── RidePlanningPage.jsx   # Ride management and TixiTaxi coordination
    │   │   ├── InvoiceDatabasePage.jsx # Invoice records list
    │   │   ├── ProfilePage.jsx        # Profile editor
    │   │   └── LoginPage.jsx          # Login screen
    │   ├── components/
    │   │   └── StatusCard.jsx         # Reusable status feedback component
    │   ├── api/
    │   │   └── client.js              # Axios instance pointing to backend
    │   ├── App.jsx                    # Routing and nav shell
    │   └── main.jsx                   # React entry point
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/careconnect.git
cd careconnect
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (see **Environment Variables** below), then:

```bash
uvicorn main:app --reload
```

API runs at `http://localhost:8000`.
Interactive docs at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### 4. Default login

```
Username: anna.mueller
Password: careconnect123
```

Change these in **Profile** after first login.

---

## Environment Variables

Create `backend/.env` with the following keys:

```env
# --- IBM watsonx Orchestrate ---
WXO_API_KEY=           # API key from IBM Cloud resource page
WXO_INSTANCE_ID=       # WXO instance ID from IBM Cloud
WXO_INVOICE_AGENT_ID=  # Agent ID for the invoice extraction agent
WXO_EMAIL_AGENT_ID=    # Agent ID for the TixiTaxi email agent
WXO_HELP_AGENT_ID=     # Agent ID for the help & guidance agent

# Authentication mode — one of: mcsp | mcsp_v1 | mcsp_v2 | auto
WXO_AUTH_TYPE=mcsp

# --- Twilio (ride cancellation calls) ---
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=    # Your Twilio phone number in E.164 format (+41...)

# Set to "true" to skip real Twilio calls during development
MOCK_CALLS=false

# --- TixiTaxi ---
TAXI_EMAIL=            # Email address to send ride lists to

# --- CORS ---
# Comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

---

## watsonx Orchestrate Setup

### Invoice extraction agent

Deploy the ADK agent from `adk-projects/invoice_extraction_agent/`:

```bash
cd adk-projects/invoice_extraction_agent
orchestrate env activate <your-env-name>
orchestrate tools import -f tools.py
orchestrate agents import -f agent.yaml
```

Copy the agent ID from the WXO UI and set `WXO_INVOICE_AGENT_ID` in `.env`.

### Help agent

The help agent requires a knowledge base created in the WXO UI first.
See `adk-projects/help_agent/README.md` for the full two-phase deployment guide.

```bash
cd adk-projects/help_agent
orchestrate agents import -f agent.yaml
```

Copy the agent ID and set `WXO_HELP_AGENT_ID` in `.env`.

### Email agent (TixiTaxi)

Build or import the email agent in the WXO UI. Set `WXO_EMAIL_AGENT_ID` in `.env`.

---

## API Reference

### Invoice

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/invoice/upload` | Upload receipt files into the session |
| `POST` | `/api/invoice/start` | Upload files to WXO S3 and start the extraction thread |
| `POST` | `/api/invoice/approve` | Send user approval or rejection back to the agent |
| `POST` | `/api/invoice/message` | Continue thread with a message and optional files |
| `GET` | `/api/invoice/messages/{session_id}` | Poll thread for latest agent prompt |

### Ride Planning

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/rides` | List rides for a year |
| `POST` | `/api/rides` | Create a planned ride |
| `PATCH` | `/api/rides/{ride_id}` | Update ride details |
| `DELETE` | `/api/rides/{ride_id}` | Delete a ride |
| `POST` | `/api/rides/send-tixi-email` | Format and email ride list to TixiTaxi via WXO |
| `POST` | `/api/rides/cancel-ride` | Trigger Twilio call to TixiTaxi cancellation line |
| `GET` | `/api/rides/check-twilio` | Verify Twilio credentials are configured |

### Invoice Records

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/invoice-db` | List all invoices and rides for a year |
| `POST` | `/api/invoice-db/upload` | Upload invoice file with metadata |
| `GET` | `/api/invoice-db/file/{inv_id}` | Download a stored receipt file |
| `PATCH` | `/api/invoice-db/{inv_id}` | Update invoice record |
| `DELETE` | `/api/invoice-db/{inv_id}` | Delete invoice record |

### Profile

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/profile` | Read profile (password masked) |
| `PUT` | `/api/profile` | Update profile fields |

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Username/password login |

### Help

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/help/start` | Initialise a help chat session |
| `POST` | `/api/help/message` | Send message to the help agent |
| `GET` | `/api/help/messages/{session_id}` | Get full conversation history |

### General

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health check |

---

## Data Storage

All data is persisted as JSON files under `backend/data/` (created automatically
on first write). Receipt files are stored under `backend/data/invoice_uploads/`.
No external database is required.

| File | Contents |
| --- | --- |
| `data/profile.json` | Parent/child profile and account credentials |
| `data/rides.json` | Planned rides keyed by year |
| `data/invoice_db.json` | Invoice records keyed by year |
| `data/invoice_uploads/` | Uploaded receipt image and PDF files |

---

## SVA Business Rules (enforced by the invoice agent)

| Transport type | Rule |
| --- | --- |
| OV (public transport) | 2nd class fare only; use the discounted price if half-fare applies |
| Privatauto (private car) | CHF 0.70 per km; requires km count from the user |
| Taxi / Fahrdienst | Receipt amount used directly |

Only one cost column is filled per Form 5050 row. Total equals that column.
Meals are tracked under EL (not Form 5050) in the separate Meal category.
