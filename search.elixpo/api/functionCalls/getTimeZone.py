from timezonefinder import TimezoneFinder
from geopy.geocoders import Nominatim
from datetime import datetime
import pytz

def get_local_time(location_name: str):
    try:
        if location_name in pytz.all_timezones:
            timezone_str = location_name
        else:
            geolocator = Nominatim(user_agent="elixposearch-timezone")
            location = geolocator.geocode(location_name, timeout=10)

            if not location:
                return f"❌ Could not find the location: '{location_name}'."

            tf = TimezoneFinder()
            timezone_str = tf.timezone_at(lat=location.latitude, lng=location.longitude)

            if not timezone_str:
                return f"❌ Could not determine the timezone for '{location_name}'."

        tz = pytz.timezone(timezone_str)
        local_time = datetime.now(tz)
        utc_time = local_time.astimezone(pytz.utc)
        city = timezone_str.split("/")[-1].replace("_", " ")
        local_time_str = local_time.strftime("%I:%M %p on %Y-%m-%d")
        utc_time_str = utc_time.strftime("%H:%M UTC")
        return f"🕒 The current time in {city} is {local_time_str}, and that corresponds to {utc_time_str}."

    except Exception as e:
        return f"⚠️ Error while getting time for '{location_name}': {str(e)}"


if __name__ == "__main__":
    print(get_local_time("Asia/Kolkata"))
    print(get_local_time("Kolkata"))
