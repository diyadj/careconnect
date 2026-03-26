# CareConnect - Prototype 1

An agentic AI assistant that helps families managing disability care admin.
Built as a hybrid system: IBM watsonx Orchestrate handles invoice matching (Use Case 1),
and a Python/Claude backend handles mileage tracking (Use Case 2).

---

## Project Structure

```
careconnect/
  backend/
    main.py                   # FastAPI app entry point
    routes/
      invoice.py              # UC1: calls watsonx Orchestrate agent
      mileage.py              # UC2: weekly check-in and mileage log endpoints
    agents/
      mileage_agent.py        # Claude-powered trip report parser
    tools/
      sheets_updater.py       # Writes parsed data to Google Sheets
    requirements.txt
    .env.example              # Copy this to .env and fill in your keys
  frontend/
    src/
      pages/
        InvoicePage.jsx       # UC1 upload and approval UI
        MileagePage.jsx       # UC2 weekly check-in UI
      components/
        StatusCard.jsx        # Reusable status feedback component
      api/
        client.js             # Axios instance pointing to backend
      App.jsx                 # Routing and nav
      main.jsx                # React entry point
    index.html
    package.json
    vite.config.js
```

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/careconnect.git
cd careconnect
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Open `.env` and add:
- Your watsonx Orchestrate API key, instance ID, and agent ID (from the Deploy tab in wxO)
- Your Anthropic API key (from console.anthropic.com)
- Your Google Sheet ID (from the sheet URL)
- The path to your downloaded Google service account credentials JSON

Start the backend:

```bash
uvicorn main:app --reload
```

The API will be live at `http://localhost:8000`. You can explore all endpoints at `http://localhost:8000/docs`.

### 3. Frontend setup

```bash
cd ../frontend
npm install
npm run dev
```

The frontend will be running at `http://localhost:5173`.

---

## Google Sheets Setup

1. Go to Google Cloud Console and create a new project
2. Enable the Google Sheets API for that project
3. Create a Service Account and download the JSON credentials file
4. Place the JSON file in `backend/` and set `GOOGLE_CREDENTIALS_PATH` in your `.env`
5. Create a Google Sheet called "CareConnect Mileage Log"
6. Add a tab named "Mileage Log" with these headers in row 1:
   `Week | Normal Schedule | Sick Days | Extra KM | Extra Trip Notes | Notes`
7. Share the sheet with the service account email (found in your credentials JSON)

---

## watsonx Orchestrate Setup (UC1)

1. Sign up for the 30-day free trial at ibm.com/watsonx/orchestrate
2. Build your invoice matching agentic workflow in the wxO builder
3. Deploy the agent and copy the Agent ID from the Deploy tab
4. Copy your instance ID and API key from the IBM Cloud resource page
5. Paste all three into your `.env` file

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/api/invoice/run` | Upload two PDFs and trigger the watsonx agent |
| POST | `/api/invoice/approve` | Send approval or rejection back to the agent |
| POST | `/api/mileage/checkin` | Submit weekly trip report, logs to Google Sheets |
| GET | `/api/mileage/summary` | Get yearly mileage summary (placeholder) |

---

## What is Stubbed / Coming in Prototype 2

- Real Gmail inbox monitoring (currently simulated via manual PDF upload)
- Automated weekly scheduler for the mileage check-in
- Annual schedule planning phase for UC1
- Supervisor agent routing between UC1 and UC2
- User authentication
