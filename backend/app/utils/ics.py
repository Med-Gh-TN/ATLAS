import datetime as dt
from datetime import datetime, timedelta
from typing import List

def generate_ics_content(
    title: str,
    description: str,
    start_date: datetime,
    end_date: datetime | None = None,
    location: str = "",
    uid: str = ""
) -> str:
    if end_date is None:
        end_date = start_date + timedelta(minutes=30)

    dtstart = start_date.strftime("%Y%m%dT%H%M%S")
    dtend = end_date.strftime("%Y%m%dT%H%M%S")
    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")

    return f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ATLAS//Study Planner//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:{uid or f"atlas-{dtstamp}"}
DTSTAMP:{dtstamp}
DTSTART:{dtstart}
DTEND:{dtend}
SUMMARY:{title}
DESCRIPTION:{description}
LOCATION:{location}
END:VEVENT
END:VCALENDAR"""


def generate_study_session_ics(
    sessions: List[dict],
    user_name: str = "Student"
) -> str:
    events = []
    for idx, session in enumerate(sessions):
        title = session.get("title", "Study Session")
        description = session.get("description", "Study session")
        date_str = session.get("date")
        duration = session.get("duration", 30)

        if date_str:
            start = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            continue

        end = start + timedelta(minutes=duration)
        uid = f"atlas-{user_name.lower().replace(' ', '-')}-session-{idx}-{dt.datetime.utcnow().strftime('%Y%m%d')}"

        events.append(f"""BEGIN:VEVENT
UID:{uid}
DTSTAMP:{datetime.utcnow().strftime("%Y%m%dT%H%M%S")}
DTSTART:{start.strftime("%Y%m%dT%H%M%S")}
DTEND:{end.strftime("%Y%m%dT%H%M%S")}
SUMMARY:{title}
DESCRIPTION:{description}
END:VEVENT""")

    calendar = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ATLAS//Study Planner//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
"""
    calendar += "\n".join(events)
    calendar += """
END:VCALENDAR"""

    return calendar