from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import invoice, mileage

app = FastAPI(title="CareConnect API", version="1.0.0")

# Allow requests from the React frontend during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invoice.router, prefix="/api/invoice", tags=["Invoice Agent"])
app.include_router(mileage.router, prefix="/api/mileage", tags=["Mileage Agent"])


@app.get("/")
def health_check():
    return {"status": "CareConnect API is running"}
