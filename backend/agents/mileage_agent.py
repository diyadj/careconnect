import os
import json
from anthropic import AsyncAnthropic

client = None

def get_client():
    global client
    if client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        client = AsyncAnthropic(api_key=api_key)
    return client

SYSTEM_PROMPT = """
You are a helpful assistant that processes weekly trip reports from a father
who drives his disabled son to therapy and day care. Your job is to extract
structured data from his short informal messages.

Always return a valid JSON object with exactly these fields:
{
  "normal_schedule_completed": true or false,
  "sick_days": ["YYYY-MM-DD"],
  "extra_trips": [{"km": number, "reason": "string"}],
  "notes": "any other relevant info as a short string"
}

Do not include any text outside the JSON object. No markdown, no explanation.
"""


async def parse_weekly_report(week_date: str, father_message: str) -> dict:
    """
    Sends the father's message to Claude and gets back structured mileage data.
    """
    client = get_client()
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Week of {week_date}. Father's message: \"{father_message}\""
                )
            }
        ]
    )

    raw = response.content[0].text.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # If Claude returns something unexpected, return a safe fallback
        parsed = {
            "normal_schedule_completed": True,
            "sick_days": [],
            "extra_trips": [],
            "notes": f"Could not parse response. Raw: {raw}"
        }

    return parsed
