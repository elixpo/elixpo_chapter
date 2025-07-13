from timezonefinder import TimezoneFinder
from geopy.geocoders import Nominatim
from datetime import datetime, timedelta, timezone
import pytz


def get_timezone_and_offset(location_name: str):
    try:
        geolocator = Nominatim(user_agent="elixposearch-timezone")
        location = geolocator.geocode(location_name, timeout=10)

        if not location:
            print("[INFO] Could not find the location.")
            return None, None

        tf = TimezoneFinder()
        timezone_str = tf.timezone_at(lat=location.latitude, lng=location.longitude)

        if not timezone_str:
            print("[INFO] Could not find timezone for these coordinates.")
            return None, None

        timezone = pytz.timezone(timezone_str)
        now = datetime.utcnow()
        offset_seconds = timezone.utcoffset(now).total_seconds()
        offset_hours = int(offset_seconds // 3600)
        offset_minutes = int((offset_seconds % 3600) // 60)

        # Format as UTC+05:30 or UTC-04:00
        sign = "+" if offset_seconds >= 0 else "-"
        offset_str = f"UTC{sign}{abs(offset_hours):02d}:{abs(offset_minutes):02d}"

        return timezone_str, offset_str

    except Exception as e:
        print(f"[ERROR] Failed to get timezone for {location_name}: {e}")
        return None, None

def convert_utc_to_local(utc_datetime: datetime, offset_str: str):
    sign = 1 if '+' in offset_str else -1
    parts = offset_str.replace('UTC', '').replace('+', '').replace('-', '').split(':')
    hours = int(parts[0])
    minutes = int(parts[1])

    delta = timedelta(hours=hours * sign, minutes=minutes * sign)
    local_time = utc_datetime + delta
    return local_time.strftime("%H:%M on %Y-%m-%d")



if __name__ == "__main__":
    location = "USA"
    timezone, utc_offset = get_timezone_and_offset(location)
    print(f"[DEBUG] Timezone for {location}: {timezone}, Offset: {utc_offset}")
