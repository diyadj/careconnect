# SVA Invoice Extraction Agent

Reads Swiss public transport receipts (image or PDF) and assembles a
validated row for the SVA Form 5050 monthly transport cost table.

## What it does

1. Extracts travel date, CHF amount, and transport type from the uploaded receipt
2. Classifies the transport into OV / Privatauto / Taxi per SVA guidelines
3. Asks the user for Behandlungsgrund and Behandlungsort (not on receipts)
4. Returns a fully validated FormRow JSON ready to pre-fill Form 5050

## Setup

### 1. Prerequisites

- Python 3.11+
- IBM watsonx Orchestrate ADK installed (`pip install ibm-watsonx-orchestrate`)
- An active WXO environment activated (`orchestrate env activate <name>`)

### 2. Environment variables

The WXO credentials (`WXO_API_KEY`, `WXO_INSTANCE_ID`) are already
configured via the `orchestrate` CLI environment. No extra keys needed.

### 3. Install dependencies

```bash
pip install ibm-watsonx-orchestrate pydantic
```

### 4. Deploy

Run both commands from inside `invoice_extraction_agent/`. Tools must be
registered before the agent, because the agent references them by name.

```bash
# Step 1: register the three tools
orchestrate tools import -f tools.py

# Step 2: register the agent (references the tool names above)
orchestrate agents import -f agent.yaml
```

### 5. Verify

```bash
orchestrate tools list
orchestrate agents list
```

Both `invoice_extraction_agent` (agent) and the three tools should appear.

## SVA business rules enforced

| Transport type | Rule |
| --- | --- |
| OV | 2nd class fare only; use the discounted price if half-fare applies |
| Privatauto | CHF 0.70 per km, calculated from km entered by user |
| Taxi | Receipt amount used directly |

Only one cost column is filled per row. Total equals that column.

## File overview

| File | Purpose |
| --- | --- |
| `models.py` | Pydantic schemas for ExtractedReceipt and FormRow |
| `tools.py` | Three @tool functions: extract, classify, assemble |
| `agent.py` | Agent definition, system prompt, ADK registration |
