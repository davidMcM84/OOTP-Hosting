import math
import sqlite3
from pathlib import Path
from app.config import SAVES_DB_DIR

LEVEL_PRIORITY = {
    "MLB": 100,
    "Historic MLB": 94,
    "Triple-A": 90,
    "Historic Triple-A": 84,
    "Double-A": 80,
    "Historic Double-A": 76,
    "International Pro": 78,
    "High-A": 73,
    "Single-A": 70,
    "MLB Partner / Indie": 68,
    "MLB Draft League": 65,
    "Historic Single-A": 62,
    "Historic MiLB / Indie": 60,
    "Historic / Regional": 56,
}

METRO_ALIASES = {
    "Moosic": ["Scranton", "Wilkes-Barre", "Pittston", "Hazleton", "Dunmore"],
    "Allentown": ["Bethlehem", "Easton", "Lehigh Valley", "Whitehall"],
    "Lawrenceville": ["Atlanta", "Gwinnett", "Duluth", "Marietta", "Alpharetta"],
    "Midland": ["Saginaw", "Bay City", "Flint", "Mount Pleasant"],
    "Comstock Park": ["Grand Rapids", "Wyoming", "Kentwood", "Muskegon", "Holland"],
    "Salisbury": ["Ocean City", "Dover", "Easton", "Cambridge"],
    "North Little Rock": ["Little Rock", "Conway", "Pine Bluff"],
    "Springdale": ["Fayetteville", "Bentonville", "Rogers"],
    "Madison": ["Huntsville", "Decatur", "Athens"],
    "Eastlake": ["Mentor", "Euclid", "Painesville", "Willoughby"],
    "Lakewood": ["Toms River", "Brick", "Asbury Park", "Jersey Shore", "Freehold"],
    "Wappingers Falls": ["Poughkeepsie", "Newburgh", "Kingston", "Middletown", "Beacon"],
    "Davenport": ["Moline", "Rock Island", "Bettendorf", "Quad Cities"],
    "Pasco": ["Kennewick", "Richland", "Tri-Cities", "Yakima"],
    "Appleton": ["Green Bay", "Oshkosh", "Fond du Lac", "Neenah"],
    "Durham": ["Raleigh", "Chapel Hill", "Cary"],
    "Norfolk": ["Virginia Beach", "Newport News", "Hampton", "Portsmouth", "Suffolk"],
    "Chesapeake": ["Bowie", "Annapolis", "Columbia", "Silver Spring"],
    "Arlington": ["Dallas", "Fort Worth", "Irving", "Plano", "Garland"],
    "Frisco": ["Plano", "McKinney", "Denton", "Dallas", "Fort Worth"],
    "Round Rock": ["Austin", "Georgetown", "Cedar Park", "San Marcos"],
    "Sugar Land": ["Houston", "Pasadena", "Pearland", "The Woodlands", "Katy"],
    "St. Petersburg": ["Tampa", "Clearwater", "Brandon", "Largo"],
    "St. Paul": ["Minneapolis", "Bloomington", "Duluth", "Rochester"],
    "Anaheim": ["Irvine", "Santa Ana", "Huntington Beach", "Orange", "Fullerton"],
    "Ontario": ["Riverside", "San Bernardino", "Fontana", "Moreno Valley", "Corona"],
    "Rancho Cucamonga": ["Pomona", "Ontario", "Fontana", "Riverside"],
    "Hillsboro": ["Portland", "Beaverton", "Gresham", "Salem"],
    "Tacoma": ["Seattle", "Bellevue", "Kent", "Olympia", "Federal Way"],
    "Everett": ["Seattle", "Bellevue", "Bellingham", "Marysville"],
    "Somerset": ["New Brunswick", "Edison", "Bridgewater", "Princeton", "Plainfield"],
    "Kannapolis": ["Concord", "Charlotte", "Gastonia", "Salisbury"],
    "Spartanburg": ["Greenville", "Anderson", "Greer"],
    "Salem": ["Roanoke", "Blacksburg", "Christiansburg"],
    "Clearwater": ["Tampa", "St. Petersburg", "Largo"],
    "Dunedin": ["Clearwater", "Tampa", "St. Petersburg"],
    "Fort Myers": ["Cape Coral", "Naples", "Bonita Springs"],
    "Bradenton": ["Sarasota", "Venice", "North Port"],
    "Jupiter": ["West Palm Beach", "Boca Raton", "Boynton Beach", "Delray Beach"],
    "Palm Beach": ["West Palm Beach", "Boca Raton", "Lake Worth"],
    "Port St. Lucie": ["Fort Pierce", "Stuart", "Vero Beach", "Melbourne"],
    "Biloxi": ["Gulfport", "Pascagoula", "Hattiesburg"],
}

# Canonical Built-In Registry covering MLB, Triple-A, Double-A, High-A, Single-A, Partner/Indie, Draft League & Historic Clubs
CURATED_COUNTERPARTS = [
    # MLB (30)
    {"city_id": 58739, "city": "Phoenix", "state": "AZ", "lat": 33.54, "lon": -112.07, "team_name": "Arizona Diamondbacks", "nickname": "Diamondbacks", "abbr": "AZ", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Chase Field", "capacity": 48635, "aliases": ["Scottsdale", "Mesa", "Tempe", "Glendale"]},
    {"city_id": 4704, "city": "Atlanta", "state": "GA", "lat": 33.76, "lon": -84.42, "team_name": "Atlanta Braves", "nickname": "Braves", "abbr": "ATL", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Truist Park", "capacity": 41151, "aliases": ["Marietta", "Sandy Springs"]},
    {"city_id": 6650, "city": "Baltimore", "state": "MD", "lat": 39.30, "lon": -76.61, "team_name": "Baltimore Orioles", "nickname": "Orioles", "abbr": "BAL", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Oriole Park at Camden Yards", "capacity": 45973, "aliases": ["Towson", "Columbia"]},
    {"city_id": 10948, "city": "Boston", "state": "MA", "lat": 42.34, "lon": -71.02, "team_name": "Boston Red Sox", "nickname": "Red Sox", "abbr": "BOS", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Fenway Park", "capacity": 37501, "aliases": ["Cambridge", "Quincy", "Lowell"]},
    {"city_id": 13181, "city": "Chicago", "state": "IL", "lat": 41.84, "lon": -87.68, "team_name": "Chicago Cubs", "nickname": "Cubs", "abbr": "CHC", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Wrigley Field", "capacity": 41074, "aliases": ["Evanston", "Naperville", "Aurora"]},
    {"city_id": 13181, "city": "Chicago", "state": "IL", "lat": 41.84, "lon": -87.68, "team_name": "Chicago White Sox", "nickname": "White Sox", "abbr": "CWS", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Rate Field", "capacity": 40617, "aliases": []},
    {"city_id": 13776, "city": "Cincinnati", "state": "OH", "lat": 39.14, "lon": -84.51, "team_name": "Cincinnati Reds", "nickname": "Reds", "abbr": "CIN", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Great American Ball Park", "capacity": 42323, "aliases": ["Covington", "Hamilton"]},
    {"city_id": 14082, "city": "Cleveland", "state": "OH", "lat": 41.48, "lon": -81.68, "team_name": "Cleveland Guardians", "nickname": "Guardians", "abbr": "CLE", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Progressive Field", "capacity": 42489, "aliases": ["Parma", "Lorain"]},
    {"city_id": 20170, "city": "Denver", "state": "CO", "lat": 39.76, "lon": -104.88, "team_name": "Colorado Rockies", "nickname": "Rockies", "abbr": "COL", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Coors Field", "capacity": 50482, "aliases": ["Aurora", "Lakewood", "Boulder"]},
    {"city_id": 20315, "city": "Detroit", "state": "MI", "lat": 42.38, "lon": -83.10, "team_name": "Detroit Tigers", "nickname": "Tigers", "abbr": "DET", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Comerica Park", "capacity": 41683, "aliases": ["Dearborn", "Warren", "Sterling Heights"]},
    {"city_id": 32688, "city": "Houston", "state": "TX", "lat": 29.77, "lon": -95.39, "team_name": "Houston Astros", "nickname": "Astros", "abbr": "HOU", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Daikin Park", "capacity": 42062, "aliases": ["Pasadena", "The Woodlands"]},
    {"city_id": 36925, "city": "Kansas City", "state": "MO", "lat": 39.12, "lon": -94.55, "team_name": "Kansas City Royals", "nickname": "Royals", "abbr": "KC", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Kauffman Stadium", "capacity": 37905, "aliases": ["Overland Park", "Independence", "Olathe"]},
    {"city_id": 2845, "city": "Anaheim", "state": "CA", "lat": 33.84, "lon": -117.89, "team_name": "Los Angeles Angels", "nickname": "Angels", "abbr": "LAA", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Angel Stadium of Anaheim", "capacity": 45485, "aliases": ["Irvine", "Santa Ana", "Huntington Beach", "Orange"]},
    {"city_id": 41955, "city": "Los Angeles", "state": "CA", "lat": 34.11, "lon": -118.41, "team_name": "Los Angeles Dodgers", "nickname": "Dodgers", "abbr": "LAD", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Dodger Stadium", "capacity": 55002, "aliases": ["Long Beach", "Pasadena", "Glendale", "Burbank"]},
    {"city_id": 50031, "city": "Miami", "state": "FL", "lat": 25.78, "lon": -80.21, "team_name": "Miami Marlins", "nickname": "Marlins", "abbr": "MIA", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "LoanDepot Park", "capacity": 37424, "aliases": ["Hialeah", "Fort Lauderdale", "Hollywood"]},
    {"city_id": 50428, "city": "Milwaukee", "state": "WI", "lat": 43.06, "lon": -87.97, "team_name": "Milwaukee Brewers", "nickname": "Brewers", "abbr": "MIL", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "American Family Field", "capacity": 41902, "aliases": ["Waukesha", "Racine", "Kenosha"]},
    {"city_id": 50536, "city": "Minneapolis", "state": "MN", "lat": 44.96, "lon": -93.27, "team_name": "Minnesota Twins", "nickname": "Twins", "abbr": "MIN", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Target Field", "capacity": 39023, "aliases": ["St. Paul", "Bloomington"]},
    {"city_id": 55211, "city": "New York", "state": "NY", "lat": 40.67, "lon": -73.94, "team_name": "New York Yankees", "nickname": "Yankees", "abbr": "NYY", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Yankee Stadium", "capacity": 57547, "aliases": ["Bronx", "Manhattan", "Yonkers"]},
    {"city_id": 55211, "city": "New York", "state": "NY", "lat": 40.67, "lon": -73.94, "team_name": "New York Mets", "nickname": "Mets", "abbr": "NYM", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Citi Field", "capacity": 41924, "aliases": ["Queens", "Brooklyn"]},
    {"city_id": 58713, "city": "Philadelphia", "state": "PA", "lat": 40.01, "lon": -75.13, "team_name": "Philadelphia Phillies", "nickname": "Phillies", "abbr": "PHI", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Citizens Bank Park", "capacity": 43653, "aliases": []},
    {"city_id": 59354, "city": "Pittsburgh", "state": "PA", "lat": 40.44, "lon": -79.98, "team_name": "Pittsburgh Pirates", "nickname": "Pirates", "abbr": "PIT", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "PNC Park", "capacity": 38364, "aliases": []},
    {"city_id": 69896, "city": "San Diego", "state": "CA", "lat": 32.81, "lon": -117.14, "team_name": "San Diego Padres", "nickname": "Padres", "abbr": "SD", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Petco Park", "capacity": 42526, "aliases": ["Chula Vista", "Oceanside", "Carlsbad"]},
    {"city_id": 69999, "city": "San Francisco", "state": "CA", "lat": 37.77, "lon": -122.45, "team_name": "San Francisco Giants", "nickname": "Giants", "abbr": "SF", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Oracle Park", "capacity": 41917, "aliases": ["San Mateo", "Daly City"]},
    {"city_id": 72460, "city": "Seattle", "state": "WA", "lat": 47.62, "lon": -122.35, "team_name": "Seattle Mariners", "nickname": "Mariners", "abbr": "SEA", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "T-Mobile Park", "capacity": 47478, "aliases": ["Bellevue", "Renton"]},
    {"city_id": 69095, "city": "St. Louis", "state": "MO", "lat": 38.64, "lon": -90.24, "team_name": "St. Louis Cardinals", "nickname": "Cardinals", "abbr": "STL", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Busch Stadium", "capacity": 45401, "aliases": ["St. Charles", "Belleville"]},
    {"city_id": 69137, "city": "St. Petersburg", "state": "FL", "lat": 27.76, "lon": -82.64, "team_name": "Tampa Bay Rays", "nickname": "Rays", "abbr": "TB", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Tropicana Field", "capacity": 31044, "aliases": ["Tampa", "Clearwater", "Brandon"]},
    {"city_id": 4076, "city": "Arlington", "state": "TX", "lat": 32.70, "lon": -97.12, "team_name": "Texas Rangers", "nickname": "Rangers", "abbr": "TEX", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Globe Life Field", "capacity": 40302, "aliases": ["Dallas", "Fort Worth", "Irving", "Grand Prairie"]},
    {"city_id": 80680, "city": "Toronto", "state": "ON", "lat": 43.65, "lon": -79.38, "team_name": "Toronto Blue Jays", "nickname": "Blue Jays", "abbr": "TOR", "level": "MLB", "league": "Major League Baseball (AL)", "parent_abbr": "MLB", "park": "Rogers Centre", "capacity": 50600, "aliases": ["Mississauga", "Brampton", "Hamilton", "Markham"]},
    {"city_id": 87845, "city": "Washington", "state": "DC", "lat": 38.91, "lon": -77.02, "team_name": "Washington Nationals", "nickname": "Nationals", "abbr": "WSH", "level": "MLB", "league": "Major League Baseball (NL)", "parent_abbr": "MLB", "park": "Nationals Park", "capacity": 41224, "aliases": ["Arlington", "Alexandria", "Bethesda"]},
    {"city_id": 67700, "city": "Sacramento", "state": "CA", "lat": 38.57, "lon": -121.47, "team_name": "Sacramento River Cats / Athletics", "nickname": "River Cats", "abbr": "SAC", "level": "Triple-A", "league": "Pacific Coast League (PCL) / MLB Temp", "parent_abbr": "SF", "park": "Sutter Health Park", "capacity": 14000, "aliases": ["Elk Grove", "Roseville", "Davis"]},

    # Triple-A (IL & PCL)
    {"city_id": 1405, "city": "Albuquerque", "state": "NM", "lat": 35.11, "lon": -106.62, "team_name": "Albuquerque Isotopes", "nickname": "Isotopes", "abbr": "ABQ", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "COL", "park": "Isotopes Park", "capacity": 12215, "aliases": ["Rio Rancho", "Santa Fe"]},
    {"city_id": 12314, "city": "Buffalo", "state": "NY", "lat": 42.89, "lon": -78.86, "team_name": "Buffalo Bisons", "nickname": "Bisons", "abbr": "BUF", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "TOR", "park": "Sahlen Field", "capacity": 19500, "aliases": ["Niagara Falls", "Cheektowaga", "Amherst"]},
    {"city_id": 18952, "city": "Charlotte", "state": "NC", "lat": 35.20, "lon": -80.83, "team_name": "Charlotte Knights", "nickname": "Knights", "abbr": "CHR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "CWS", "park": "Truist Field", "capacity": 10200, "aliases": ["Concord", "Rock Hill", "Gastonia"]},
    {"city_id": 14625, "city": "Columbus", "state": "OH", "lat": 39.99, "lon": -82.99, "team_name": "Columbus Clippers", "nickname": "Clippers", "abbr": "CLM", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "CLE", "park": "Huntington Park", "capacity": 10000, "aliases": ["Dublin", "Westerville"]},
    {"city_id": 19502, "city": "Durham", "state": "NC", "lat": 35.98, "lon": -78.91, "team_name": "Durham Bulls", "nickname": "Bulls", "abbr": "DUR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "TB", "park": "Durham Bulls Athletic Park", "capacity": 10000, "aliases": ["Raleigh", "Chapel Hill", "Cary"]},
    {"city_id": 23176, "city": "El Paso", "state": "TX", "lat": 31.85, "lon": -106.44, "team_name": "El Paso Chihuahuas", "nickname": "Chihuahuas", "abbr": "EP", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "SD", "park": "Southwest University Park", "capacity": 7500, "aliases": ["Ciudad Juarez", "Las Cruces"]},
    {"city_id": 44165, "city": "Lawrenceville", "state": "GA", "lat": 33.95, "lon": -83.99, "team_name": "Gwinnett Stripers", "nickname": "Stripers", "abbr": "GWI", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "ATL", "park": "Coolray Field", "capacity": 10427, "aliases": ["Duluth", "Alpharetta", "Gwinnett"]},
    {"city_id": 34491, "city": "Indianapolis", "state": "IN", "lat": 39.78, "lon": -86.15, "team_name": "Indianapolis Indians", "nickname": "Indians", "abbr": "IND", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "PIT", "park": "Victory Field", "capacity": 15500, "aliases": ["Carmel", "Fishers", "Bloomington"]},
    {"city_id": 20253, "city": "Des Moines", "state": "IA", "lat": 41.58, "lon": -93.62, "team_name": "Iowa Cubs", "nickname": "Cubs", "abbr": "IOW", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "CHC", "park": "Principal Park", "capacity": 11000, "aliases": ["West Des Moines", "Ankeny", "Ames"]},
    {"city_id": 34776, "city": "Jacksonville", "state": "FL", "lat": 30.33, "lon": -81.66, "team_name": "Jacksonville Jumbo Shrimp", "nickname": "Jumbo Shrimp", "abbr": "JAC", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "MIA", "park": "VyStar Ballpark", "capacity": 11000, "aliases": ["St. Augustine", "Orange Park"]},
    {"city_id": 43942, "city": "Las Vegas", "state": "NV", "lat": 36.23, "lon": -115.26, "team_name": "Las Vegas Aviators", "nickname": "Aviators", "abbr": "LVA", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "ATH", "park": "Las Vegas Ballpark", "capacity": 10000, "aliases": ["Henderson", "North Las Vegas", "Summerlin"]},
    {"city_id": 1707, "city": "Allentown", "state": "PA", "lat": 40.60, "lon": -75.48, "team_name": "Lehigh Valley IronPigs", "nickname": "IronPigs", "abbr": "LHV", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "PHI", "park": "Coca-Cola Park", "capacity": 10100, "aliases": ["Bethlehem", "Easton", "Whitehall", "Lehigh Valley"]},
    {"city_id": 42078, "city": "Louisville", "state": "KY", "lat": 38.17, "lon": -85.65, "team_name": "Louisville Bats", "nickname": "Bats", "abbr": "LOU", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "CIN", "park": "Louisville Slugger Field", "capacity": 13131, "aliases": ["New Albany", "Jeffersonville"]},
    {"city_id": 49583, "city": "Memphis", "state": "TN", "lat": 35.11, "lon": -90.01, "team_name": "Memphis Redbirds", "nickname": "Redbirds", "abbr": "MEM", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "STL", "park": "AutoZone Park", "capacity": 12512, "aliases": ["Bartlett", "Germantown", "Southaven"]},
    {"city_id": 54298, "city": "Nashville", "state": "TN", "lat": 36.17, "lon": -86.78, "team_name": "Nashville Sounds", "nickname": "Sounds", "abbr": "NAS", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "MIL", "park": "First Horizon Park", "capacity": 10000, "aliases": ["Murfreesboro", "Franklin", "Clarksville"]},
    {"city_id": 56019, "city": "Norfolk", "state": "VA", "lat": 36.92, "lon": -76.24, "team_name": "Norfolk Tides", "nickname": "Tides", "abbr": "NOR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "BAL", "park": "Harbor Park", "capacity": 12067, "aliases": ["Virginia Beach", "Newport News", "Hampton", "Portsmouth", "Suffolk"]},
    {"city_id": 57035, "city": "Oklahoma City", "state": "OK", "lat": 35.47, "lon": -97.51, "team_name": "Oklahoma City Comets", "nickname": "Comets", "abbr": "OKC", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "LAD", "park": "Chickasaw Bricktown Ballpark", "capacity": 13066, "aliases": ["Norman", "Edmond", "Lawton"]},
    {"city_id": 57291, "city": "Omaha", "state": "NE", "lat": 41.26, "lon": -96.05, "team_name": "Omaha Storm Chasers", "nickname": "Storm Chasers", "abbr": "OMA", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "KC", "park": "Werner Park", "capacity": 9023, "aliases": ["Bellevue", "Council Bluffs"]},
    {"city_id": 66889, "city": "Reno", "state": "NV", "lat": 39.55, "lon": -119.85, "team_name": "Reno Aces", "nickname": "Aces", "abbr": "REN", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "AZ", "park": "Greater Nevada Field", "capacity": 11500, "aliases": ["Sparks", "Carson City"]},
    {"city_id": 66478, "city": "Rochester", "state": "NY", "lat": 43.17, "lon": -77.62, "team_name": "Rochester Red Wings", "nickname": "Red Wings", "abbr": "ROC", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "WSH", "park": "Innovative Field", "capacity": 10868, "aliases": ["Greece", "Irondequoit"]},
    {"city_id": 65670, "city": "Round Rock", "state": "TX", "lat": 30.53, "lon": -97.66, "team_name": "Round Rock Express", "nickname": "Express", "abbr": "RR", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "TEX", "park": "Dell Diamond", "capacity": 11631, "aliases": ["Austin", "Cedar Park", "Georgetown", "San Marcos"]},
    {"city_id": 69520, "city": "Salt Lake City", "state": "UT", "lat": 40.78, "lon": -111.93, "team_name": "Salt Lake Bees", "nickname": "Bees", "abbr": "SL", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "LAA", "park": "The Ballpark at America First Square", "capacity": 8000, "aliases": ["West Valley City", "Provo", "West Jordan", "Sandy"]},
    {"city_id": 51736, "city": "Moosic", "state": "PA", "lat": 41.36, "lon": -75.68, "team_name": "Scranton/WB RailRiders", "nickname": "RailRiders", "abbr": "SCR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "NYY", "park": "PNC Field", "capacity": 10982, "aliases": ["Scranton", "Wilkes-Barre", "Pittston", "Hazleton", "Dunmore"]},
    {"city_id": 69127, "city": "St. Paul", "state": "MN", "lat": 44.95, "lon": -93.10, "team_name": "St. Paul Saints", "nickname": "Saints", "abbr": "STP", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "MIN", "park": "CHS Field", "capacity": 7210, "aliases": ["Minneapolis", "Bloomington", "Rochester"]},
    {"city_id": 76678, "city": "Sugar Land", "state": "TX", "lat": 29.59, "lon": -95.63, "team_name": "Sugar Land Space Cowboys", "nickname": "Space Cowboys", "abbr": "SUG", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "HOU", "park": "Constellation Field", "capacity": 7500, "aliases": ["Houston", "Missouri City", "Pearland"]},
    {"city_id": 77297, "city": "Syracuse", "state": "NY", "lat": 43.04, "lon": -76.14, "team_name": "Syracuse Mets", "nickname": "Mets", "abbr": "SYR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "NYM", "park": "NBT Bank Stadium", "capacity": 11117, "aliases": ["Utica", "Rome", "Auburn", "Oswego"]},
    {"city_id": 77882, "city": "Tacoma", "state": "WA", "lat": 47.25, "lon": -122.46, "team_name": "Tacoma Rainiers", "nickname": "Rainiers", "abbr": "TAC", "level": "Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "SEA", "park": "Cheney Stadium", "capacity": 6500, "aliases": ["Olympia", "Lakewood", "Puyallup"]},
    {"city_id": 80442, "city": "Toledo", "state": "OH", "lat": 41.66, "lon": -83.58, "team_name": "Toledo Mud Hens", "nickname": "Mud Hens", "abbr": "TOL", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "DET", "park": "Fifth Third Field", "capacity": 10300, "aliases": ["Bowling Green", "Findlay"]},
    {"city_id": 86551, "city": "Worcester", "state": "MA", "lat": 42.27, "lon": -71.81, "team_name": "Worcester Red Sox", "nickname": "Red Sox", "abbr": "WOR", "level": "Triple-A", "league": "International League (IL)", "parent_abbr": "BOS", "park": "Polar Park", "capacity": 9508, "aliases": ["Springfield", "Framingham"]},

    # Double-A (EL, SL, TL)
    {"city_id": 849, "city": "Akron", "state": "OH", "lat": 41.08, "lon": -81.52, "team_name": "Akron RubberDucks", "nickname": "RubberDucks", "abbr": "AKR", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "CLE", "park": "7 17 Credit Union Park", "capacity": 9097, "aliases": ["Canton", "Massillon"]},
    {"city_id": 2406, "city": "Altoona", "state": "PA", "lat": 40.51, "lon": -78.40, "team_name": "Altoona Curve", "nickname": "Curve", "abbr": "ALT", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "PIT", "park": "Peoples Natural Gas Field", "capacity": 7210, "aliases": ["Hollidaysburg", "Tyrone"]},
    {"city_id": 2539, "city": "Amarillo", "state": "TX", "lat": 35.20, "lon": -101.83, "team_name": "Amarillo Sod Poodles", "nickname": "Sod Poodles", "abbr": "AMA", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "AZ", "park": "Hodgetown", "capacity": 6631, "aliases": ["Lubbock", "Canyon"]},
    {"city_id": 56158, "city": "North Little Rock", "state": "AR", "lat": 34.79, "lon": -92.25, "team_name": "Arkansas Travelers", "nickname": "Travelers", "abbr": "ARK", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "SEA", "park": "Dickey-Stephens Park", "capacity": 5800, "aliases": ["Little Rock", "Conway", "Pine Bluff"]},
    {"city_id": 9528, "city": "Biloxi", "state": "MS", "lat": 30.44, "lon": -88.93, "team_name": "Biloxi Shuckers", "nickname": "Shuckers", "abbr": "BIL", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "MIL", "park": "Keesler Federal Park", "capacity": 6076, "aliases": ["Gulfport", "Pascagoula"]},
    {"city_id": 9591, "city": "Binghamton", "state": "NY", "lat": 42.10, "lon": -75.91, "team_name": "Binghamton Rumble Ponies", "nickname": "Rumble Ponies", "abbr": "BIN", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "NYM", "park": "Mirabito Stadium", "capacity": 6012, "aliases": ["Elmira", "Ithaca", "Cortland"]},
    {"city_id": 9691, "city": "Birmingham", "state": "AL", "lat": 33.53, "lon": -86.80, "team_name": "Birmingham Barons", "nickname": "Barons", "abbr": "BIR", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "CWS", "park": "Regions Field", "capacity": 8500, "aliases": ["Hoover", "Tuscaloosa"]},
    {"city_id": 19029, "city": "Chattanooga", "state": "TN", "lat": 35.07, "lon": -85.25, "team_name": "Chattanooga Lookouts", "nickname": "Lookouts", "abbr": "CHT", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "CIN", "park": "Erlanger Park", "capacity": 8032, "aliases": ["Cleveland", "Dalton"]},
    {"city_id": 19312, "city": "Chesapeake", "state": "VA", "lat": 38.97, "lon": -76.73, "team_name": "Chesapeake Baysox", "nickname": "Baysox", "abbr": "CHE", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "BAL", "park": "Prince George's Stadium", "capacity": 10000, "aliases": ["Bowie", "Annapolis", "Columbia", "Silver Spring"]},
    {"city_id": 14616, "city": "Columbus", "state": "GA", "lat": 32.46, "lon": -84.99, "team_name": "Columbus Clingstones", "nickname": "Clingstones", "abbr": "CBS", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "ATL", "park": "Synovus Park", "capacity": 5500, "aliases": ["Phenix City", "Auburn"]},
    {"city_id": 15185, "city": "Corpus Christi", "state": "TX", "lat": 27.71, "lon": -97.37, "team_name": "Corpus Christi Hooks", "nickname": "Hooks", "abbr": "CC", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "HOU", "park": "Whataburger Field", "capacity": 7050, "aliases": ["McAllen", "Brownsville", "Laredo"]},
    {"city_id": 23889, "city": "Erie", "state": "PA", "lat": 42.13, "lon": -80.09, "team_name": "Erie SeaWolves", "nickname": "SeaWolves", "abbr": "ERI", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "DET", "park": "UPMC Park", "capacity": 6000, "aliases": ["Meadville", "Warren"]},
    {"city_id": 24713, "city": "Frisco", "state": "TX", "lat": 33.15, "lon": -96.81, "team_name": "Frisco RoughRiders", "nickname": "RoughRiders", "abbr": "FRI", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "TEX", "park": "Riders Field", "capacity": 10600, "aliases": ["Plano", "McKinney", "Denton"]},
    {"city_id": 30756, "city": "Harrisburg", "state": "PA", "lat": 40.28, "lon": -76.88, "team_name": "Harrisburg Senators", "nickname": "Senators", "abbr": "HAR", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "WSH", "park": "FNB Field", "capacity": 6302, "aliases": ["Carlisle", "Hershey", "Lebanon", "Camp Hill"]},
    {"city_id": 30805, "city": "Hartford", "state": "CT", "lat": 41.77, "lon": -72.68, "team_name": "Hartford Yard Goats", "nickname": "Yard Goats", "abbr": "HFD", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "COL", "park": "Dunkin' Park", "capacity": 6121, "aliases": ["New Haven", "Waterbury", "New Britain", "Bridgeport", "Stamford"]},
    {"city_id": 39092, "city": "Knoxville", "state": "TN", "lat": 35.97, "lon": -83.95, "team_name": "Knoxville Smokies", "nickname": "Smokies", "abbr": "KNO", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "CHC", "park": "Covenant Health Park", "capacity": 6355, "aliases": ["Maryville", "Oak Ridge", "Sevierville"]},
    {"city_id": 50143, "city": "Midland", "state": "TX", "lat": 32.02, "lon": -102.11, "team_name": "Midland RockHounds", "nickname": "RockHounds", "abbr": "MID", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "ATH", "park": "Momentum Bank Ballpark", "capacity": 6669, "aliases": ["Odessa", "Abilene", "San Angelo"]},
    {"city_id": 51547, "city": "Montgomery", "state": "AL", "lat": 32.35, "lon": -86.27, "team_name": "Montgomery Biscuits", "nickname": "Biscuits", "abbr": "MTG", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "TB", "park": "Riverwalk Stadium", "capacity": 7000, "aliases": ["Prattville", "Auburn", "Dothan"]},
    {"city_id": 47541, "city": "Manchester", "state": "NH", "lat": 42.98, "lon": -71.44, "team_name": "New Hampshire Fisher Cats", "nickname": "Fisher Cats", "abbr": "NH", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "TOR", "park": "Delta Dental Stadium", "capacity": 6500, "aliases": ["Nashua", "Concord", "Portsmouth"]},
    {"city_id": 75698, "city": "Springdale", "state": "AR", "lat": 36.19, "lon": -94.15, "team_name": "Northwest Arkansas Naturals", "nickname": "Naturals", "abbr": "NWA", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "KC", "park": "Arvest Ballpark", "capacity": 7305, "aliases": ["Fayetteville", "Bentonville", "Rogers", "Fort Smith"]},
    {"city_id": 63622, "city": "Pensacola", "state": "FL", "lat": 30.44, "lon": -87.19, "team_name": "Pensacola Blue Wahoos", "nickname": "Blue Wahoos", "abbr": "PEN", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "MIA", "park": "Blue Wahoos Stadium", "capacity": 5038, "aliases": ["Tallahassee", "Panama City", "Destin"]},
    {"city_id": 60507, "city": "Portland", "state": "ME", "lat": 43.68, "lon": -70.27, "team_name": "Portland Sea Dogs", "nickname": "Sea Dogs", "abbr": "POR", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "BOS", "park": "Hadlock Field", "capacity": 7368, "aliases": ["Lewiston", "Bangor", "Augusta"]},
    {"city_id": 65266, "city": "Reading", "state": "PA", "lat": 40.34, "lon": -75.93, "team_name": "Reading Fightin Phils", "nickname": "Fightin Phils", "abbr": "REA", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "PHI", "park": "FirstEnergy Stadium", "capacity": 9000, "aliases": ["Pottstown", "Wyomissing", "Pottsville"]},
    {"city_id": 64151, "city": "Richmond", "state": "VA", "lat": 37.53, "lon": -77.48, "team_name": "Richmond Flying Squirrels", "nickname": "Flying Squirrels", "abbr": "RCH", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "SF", "park": "CarMax Park", "capacity": 10000, "aliases": ["Petersburg", "Charlottesville"]},
    {"city_id": 46557, "city": "Madison", "state": "AL", "lat": 34.72, "lon": -86.75, "team_name": "Rocket City Trash Pandas", "nickname": "Trash Pandas", "abbr": "RCT", "level": "Double-A", "league": "Southern League (SL)", "parent_abbr": "LAA", "park": "Toyota Field", "capacity": 7500, "aliases": ["Huntsville", "Decatur", "Florence"]},
    {"city_id": 69776, "city": "San Antonio", "state": "TX", "lat": 29.46, "lon": -98.51, "team_name": "San Antonio Missions", "nickname": "Missions", "abbr": "SA", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "SD", "park": "Nelson W. Wolff Municipal Stadium", "capacity": 9200, "aliases": ["New Braunfels", "San Marcos"]},
    {"city_id": 75012, "city": "Somerset", "state": "NJ", "lat": 40.50, "lon": -74.50, "team_name": "Somerset Patriots", "nickname": "Patriots", "abbr": "SOM", "level": "Double-A", "league": "Eastern League (EL)", "parent_abbr": "NYY", "park": "TD Bank Ballpark", "capacity": 6100, "aliases": ["New Brunswick", "Edison", "Bridgewater"]},
    {"city_id": 75711, "city": "Springfield", "state": "MO", "lat": 37.19, "lon": -93.29, "team_name": "Springfield Cardinals", "nickname": "Cardinals", "abbr": "SPR", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "STL", "park": "Hammons Field", "capacity": 7986, "aliases": ["Joplin", "Branson"]},
    {"city_id": 81568, "city": "Tulsa", "state": "OK", "lat": 36.13, "lon": -95.92, "team_name": "Tulsa Drillers", "nickname": "Drillers", "abbr": "TUL", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "LAD", "park": "ONEOK Field", "capacity": 7833, "aliases": ["Broken Arrow", "Muskogee"]},
    {"city_id": 86418, "city": "Wichita", "state": "KS", "lat": 37.69, "lon": -97.34, "team_name": "Wichita Wind Surge", "nickname": "Wind Surge", "abbr": "WIC", "level": "Double-A", "league": "Texas League (TL)", "parent_abbr": "MIN", "park": "Equity Bank Park", "capacity": 10000, "aliases": ["Topeka", "Salina", "Hutchinson"]},

    # Key High-A & Single-A Franchises
    {"city_id": 12985, "city": "Brooklyn", "state": "NY", "lat": 40.65, "lon": -73.95, "team_name": "Brooklyn Dodgers / Robins", "nickname": "Dodgers", "abbr": "BRO", "level": "Historic MLB", "league": "National League (1890–1957)", "parent_abbr": "MLB", "park": "Ebbets Field", "capacity": 32000, "aliases": ["Flatbush", "Williamsburg"]},
    {"city_id": 12985, "city": "Brooklyn", "state": "NY", "lat": 40.65, "lon": -73.95, "team_name": "Brooklyn Cyclones", "nickname": "Cyclones", "abbr": "BRK", "level": "High-A", "league": "South Atlantic League (SAL)", "parent_abbr": "NYM", "park": "Maimonides Park", "capacity": 7500, "aliases": ["Coney Island"]},
    {"city_id": 22234, "city": "Dayton", "state": "OH", "lat": 39.78, "lon": -84.20, "team_name": "Dayton Dragons", "nickname": "Dragons", "abbr": "DAY", "level": "High-A", "league": "Midwest League (MWL)", "parent_abbr": "CIN", "park": "Day Air Ballpark", "capacity": 10300, "aliases": ["Springfield", "Kettering"]},
    {"city_id": 25148, "city": "Fort Wayne", "state": "IN", "lat": 41.09, "lon": -85.14, "team_name": "Fort Wayne TinCaps", "nickname": "TinCaps", "abbr": "FW", "level": "High-A", "league": "Midwest League (MWL)", "parent_abbr": "SD", "park": "Parkview Field", "capacity": 8100, "aliases": []},
    {"city_id": 75295, "city": "South Bend", "state": "IN", "lat": 41.68, "lon": -86.27, "team_name": "South Bend Cubs", "nickname": "Cubs", "abbr": "SB", "level": "High-A", "league": "Midwest League (MWL)", "parent_abbr": "CHC", "park": "Four Winds Field", "capacity": 5000, "aliases": ["Elkhart", "Mishawaka"]},
    {"city_id": 14722, "city": "Comstock Park", "state": "MI", "lat": 43.04, "lon": -85.67, "team_name": "West Michigan Whitecaps", "nickname": "Whitecaps", "abbr": "WM", "level": "High-A", "league": "Midwest League (MWL)", "parent_abbr": "DET", "park": "LMCU Ballpark", "capacity": 9281, "aliases": ["Grand Rapids", "Muskegon", "Holland"]},
    {"city_id": 43746, "city": "Lansing", "state": "MI", "lat": 42.71, "lon": -84.56, "team_name": "Lansing Lugnuts", "nickname": "Lugnuts", "abbr": "LAN", "level": "High-A", "league": "Midwest League (MWL)", "parent_abbr": "ATH", "park": "Jackson Field", "capacity": 11000, "aliases": ["East Lansing", "Jackson", "Kalamazoo"]},
    {"city_id": 29752, "city": "Greensboro", "state": "NC", "lat": 36.08, "lon": -79.83, "team_name": "Greensboro Grasshoppers", "nickname": "Grasshoppers", "abbr": "GBO", "level": "High-A", "league": "South Atlantic League (SAL)", "parent_abbr": "PIT", "park": "First National Bank Field", "capacity": 7499, "aliases": ["High Point", "Burlington"]},
    {"city_id": 86841, "city": "Winston-Salem", "state": "NC", "lat": 36.10, "lon": -80.26, "team_name": "Winston-Salem Dash", "nickname": "Dash", "abbr": "WS", "level": "High-A", "league": "South Atlantic League (SAL)", "parent_abbr": "CWS", "park": "Truist Stadium", "capacity": 5500, "aliases": []},
    {"city_id": 29773, "city": "Greenville", "state": "SC", "lat": 34.84, "lon": -82.36, "team_name": "Greenville Drive", "nickname": "Drive", "abbr": "GRV", "level": "High-A", "league": "South Atlantic League (SAL)", "parent_abbr": "BOS", "park": "Fluor Field at the West End", "capacity": 6700, "aliases": ["Spartanburg", "Anderson"]},
    {"city_id": 18926, "city": "Charleston", "state": "SC", "lat": 32.82, "lon": -79.96, "team_name": "Charleston RiverDogs", "nickname": "RiverDogs", "abbr": "CSC", "level": "Single-A", "league": "Carolina League (CAR)", "parent_abbr": "TB", "park": "Joseph P. Riley, Jr. Park", "capacity": 6000, "aliases": ["North Charleston", "Mount Pleasant"]},
    {"city_id": 14600, "city": "Columbia", "state": "SC", "lat": 34.04, "lon": -80.89, "team_name": "Columbia Fireflies", "nickname": "Fireflies", "abbr": "COL", "level": "Single-A", "league": "Carolina League (CAR)", "parent_abbr": "KC", "park": "Segra Park", "capacity": 7501, "aliases": []},
    {"city_id": 87008, "city": "Wilmington", "state": "DE", "lat": 39.74, "lon": -75.55, "team_name": "Wilmington Blue Rocks", "nickname": "Blue Rocks", "abbr": "WIL", "level": "High-A", "league": "South Atlantic League (SAL)", "parent_abbr": "WSH", "park": "Frawley Stadium", "capacity": 6532, "aliases": ["Newark", "Dover"]},
    {"city_id": 84104, "city": "Vancouver", "state": "BC", "lat": 49.25, "lon": -123.12, "team_name": "Vancouver Canadians", "nickname": "Canadians", "abbr": "VAN", "level": "High-A", "league": "Northwest League (NWL)", "parent_abbr": "TOR", "park": "Nat Bailey Stadium", "capacity": 6500, "aliases": ["Surrey", "Burnaby", "Richmond", "Victoria"]},
    {"city_id": 75641, "city": "Spokane", "state": "WA", "lat": 47.67, "lon": -117.41, "team_name": "Spokane Indians", "nickname": "Indians", "abbr": "SPO", "level": "High-A", "league": "Northwest League (NWL)", "parent_abbr": "COL", "park": "Avista Stadium", "capacity": 6803, "aliases": ["Coeur d'Alene"]},
    {"city_id": 24267, "city": "Eugene", "state": "OR", "lat": 44.05, "lon": -123.12, "team_name": "Eugene Emeralds", "nickname": "Emeralds", "abbr": "EUG", "level": "High-A", "league": "Northwest League (NWL)", "parent_abbr": "SF", "park": "PK Park", "capacity": 4000, "aliases": ["Springfield", "Corvallis"]},
    {"city_id": 24787, "city": "Fresno", "state": "CA", "lat": 36.78, "lon": -119.79, "team_name": "Fresno Grizzlies", "nickname": "Grizzlies", "abbr": "FRE", "level": "Single-A", "league": "California League (CAL) / Former AAA", "parent_abbr": "COL", "park": "Chukchansi Park", "capacity": 10650, "aliases": ["Clovis", "Bakersfield"]},
    {"city_id": 70210, "city": "San Jose", "state": "CA", "lat": 37.30, "lon": -121.85, "team_name": "San Jose Giants", "nickname": "Giants", "abbr": "SJ", "level": "Single-A", "league": "California League (CAL)", "parent_abbr": "SF", "park": "Excite Ballpark", "capacity": 4200, "aliases": ["Santa Clara", "Sunnyvale", "Palo Alto"]},

    # Historic MLB, MLB Partner / Independent, MLB Draft League & International Pro
    {"city_id": 51650, "city": "Montreal", "state": "QC", "lat": 45.52, "lon": -73.57, "team_name": "Montreal Expos", "nickname": "Expos", "abbr": "MON", "level": "Historic MLB", "league": "National League (1969–2004) / IL Royals", "parent_abbr": "MLB", "park": "Stade Olympique / Labatt Park", "capacity": 45757, "aliases": ["Laval", "Longueuil"]},
    {"city_id": 56459, "city": "Oakland", "state": "CA", "lat": 37.77, "lon": -122.22, "team_name": "Oakland Athletics / Ballers", "nickname": "Athletics", "abbr": "OAK", "level": "Historic MLB", "league": "American League (1968–2024) / Pioneer League", "parent_abbr": "MLB", "park": "Oakland Coliseum / Raimondi Park", "capacity": 46847, "aliases": ["Berkeley", "Alameda", "Fremont", "Hayward"]},
    {"city_id": 60505, "city": "Portland", "state": "OR", "lat": 45.54, "lon": -122.66, "team_name": "Portland Beavers / Mavericks", "nickname": "Beavers", "abbr": "POR", "level": "Historic Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "SD", "park": "Providence Park / Civic Stadium", "capacity": 19566, "aliases": ["Beaverton", "Gresham"]},
    {"city_id": 55156, "city": "New Orleans", "state": "LA", "lat": 30.07, "lon": -89.93, "team_name": "New Orleans Baby Cakes / Zephyrs", "nickname": "Zephyrs", "abbr": "NO", "level": "Historic Triple-A", "league": "Pacific Coast League (PCL)", "parent_abbr": "MIA", "park": "Shrine on Airline", "capacity": 10000, "aliases": ["Metairie", "Kenner", "Baton Rouge"]},
    {"city_id": 63278, "city": "Pawtucket", "state": "RI", "lat": 41.87, "lon": -71.38, "team_name": "Pawtucket Red Sox / Providence Grays", "nickname": "Grays", "abbr": "PRO", "level": "Historic Triple-A", "league": "International League / Historic NL", "parent_abbr": "BOS", "park": "McCoy Stadium", "capacity": 10031, "aliases": ["Providence", "Warwick", "Cranston", "Newport"]},
    {"city_id": 57981, "city": "Ottawa", "state": "ON", "lat": 45.42, "lon": -75.71, "team_name": "Ottawa Titans / Lynx", "nickname": "Titans", "abbr": "OTT", "level": "MLB Partner / Indie", "league": "Frontier League / Former Triple-A IL", "parent_abbr": "IND", "park": "Ottawa Stadium", "capacity": 10332, "aliases": ["Gatineau", "Kanata"]},
    {"city_id": 43532, "city": "Lancaster", "state": "PA", "lat": 40.04, "lon": -76.31, "team_name": "Lancaster Stormers", "nickname": "Stormers", "abbr": "LAN", "level": "MLB Partner / Indie", "league": "Atlantic League (ALPB)", "parent_abbr": "IND", "park": "Clipper Magazine Stadium", "capacity": 6000, "aliases": ["Ephrata", "Lititz", "Columbia"]},
    {"city_id": 88078, "city": "York", "state": "PA", "lat": 39.96, "lon": -76.73, "team_name": "York Revolution", "nickname": "Revolution", "abbr": "YRK", "level": "MLB Partner / Indie", "league": "Atlantic League (ALPB)", "parent_abbr": "IND", "park": "WellSpan Park", "capacity": 5200, "aliases": ["Hanover", "Gettysburg"]},
    {"city_id": 76053, "city": "State College", "state": "PA", "lat": 40.79, "lon": -77.86, "team_name": "State College Spikes", "nickname": "Spikes", "abbr": "STC", "level": "MLB Draft League", "league": "MLB Draft League / Former NY-Penn League", "parent_abbr": "STL", "park": "Medlar Field at Lubrano Park", "capacity": 5570, "aliases": ["Bellefonte", "Lewistown"]},
    {"city_id": 87064, "city": "Williamsport", "state": "PA", "lat": 41.24, "lon": -77.02, "team_name": "Williamsport Crosscutters", "nickname": "Crosscutters", "abbr": "WPT", "level": "MLB Draft League", "league": "MLB Draft League / Former NY-Penn League", "parent_abbr": "PHI", "park": "Journey Bank Ballpark at Historic Bowman Field", "capacity": 2366, "aliases": ["Lock Haven", "Sunbury", "Bloomsburg"]},
    {"city_id": 87842, "city": "Washington", "state": "PA", "lat": 40.17, "lon": -80.25, "team_name": "Washington Wild Things", "nickname": "Wild Things", "abbr": "WAS", "level": "MLB Partner / Indie", "league": "Frontier League", "parent_abbr": "IND", "park": "Wild Things Park", "capacity": 3200, "aliases": ["Canonsburg", "Monongahela", "Uniontown"]},
    {"city_id": 35571, "city": "Johnstown", "state": "PA", "lat": 40.33, "lon": -78.92, "team_name": "Johnstown Johnnies / Mill Rats", "nickname": "Johnnies", "abbr": "JST", "level": "Historic MiLB / Indie", "league": "Frontier League / Former Eastern League", "parent_abbr": "IND", "park": "Sargent's Stadium at the Point", "capacity": 7500, "aliases": ["Somerset", "Indiana"]},
    {"city_id": 19337, "city": "Chester", "state": "PA", "lat": 39.85, "lon": -75.36, "team_name": "Delaware County Keystones / Union", "nickname": "Keystones", "abbr": "CHE", "level": "Historic / Regional", "league": "Interstate League / Philadelphia Metro", "parent_abbr": "PHI", "park": "Subaru Waterfront Park", "capacity": 18500, "aliases": ["Upper Darby", "Media", "Norristown", "Bensalem", "Abington", "West Chester"]},
    {"city_id": 81062, "city": "Trenton", "state": "NJ", "lat": 40.22, "lon": -74.76, "team_name": "Trenton Thunder", "nickname": "Thunder", "abbr": "TRE", "level": "MLB Draft League", "league": "MLB Draft League / Former Double-A EL", "parent_abbr": "NYY", "park": "Trenton Thunder Ballpark", "capacity": 6440, "aliases": ["Princeton", "Hamilton", "Ewing"]},
    {"city_id": 55218, "city": "Newark", "state": "NJ", "lat": 40.72, "lon": -74.17, "team_name": "Newark Bears / Eagles", "nickname": "Bears", "abbr": "NWK", "level": "Historic Triple-A", "league": "International League / Negro National League", "parent_abbr": "NYY", "park": "Bears & Eagles Riverfront Stadium", "capacity": 6200, "aliases": ["Jersey City", "Elizabeth", "Hoboken", "Paterson"]},
    {"city_id": 16851, "city": "Camden", "state": "NJ", "lat": 39.94, "lon": -75.11, "team_name": "Camden Riversharks", "nickname": "Riversharks", "abbr": "CAM", "level": "MLB Partner / Indie", "league": "Atlantic League (ALPB)", "parent_abbr": "IND", "park": "Campbell's Field", "capacity": 6425, "aliases": ["Cherry Hill", "Gloucester"]},
    {"city_id": 18202, "city": "Central Islip", "state": "NY", "lat": 40.79, "lon": -73.19, "team_name": "Long Island Ducks", "nickname": "Ducks", "abbr": "LID", "level": "MLB Partner / Indie", "league": "Atlantic League (ALPB)", "parent_abbr": "IND", "park": "Fairfield Properties Ballpark", "capacity": 6002, "aliases": ["Islip", "Hempstead", "Yonkers", "Huntington", "Smithtown"]},
    {"city_id": 30250, "city": "Hagerstown", "state": "MD", "lat": 39.64, "lon": -77.72, "team_name": "Hagerstown Flying Boxcars / Suns", "nickname": "Flying Boxcars", "abbr": "HAG", "level": "MLB Partner / Indie", "league": "Atlantic League / Former Single-A SAL", "parent_abbr": "WSH", "park": "Meritus Park", "capacity": 5000, "aliases": ["Cumberland", "Martinsburg"]},
    {"city_id": 18928, "city": "Charleston", "state": "WV", "lat": 38.35, "lon": -81.63, "team_name": "Charleston Dirty Birds / Charlies", "nickname": "Dirty Birds", "abbr": "CHW", "level": "MLB Partner / Indie", "league": "Atlantic League / Former Triple-A IL", "parent_abbr": "IND", "park": "GoMart Ballpark", "capacity": 4500, "aliases": ["Huntington", "Beckley", "Parkersburg"]},
    {"city_id": 51839, "city": "Morgantown", "state": "WV", "lat": 39.64, "lon": -79.95, "team_name": "West Virginia Black Bears", "nickname": "Black Bears", "abbr": "WVB", "level": "MLB Draft League", "league": "MLB Draft League / Former NY-Penn League", "parent_abbr": "PIT", "park": "Wagener Field at Monongalia County Ballpark", "capacity": 3500, "aliases": ["Fairmont", "Clarksburg", "Wheeling"]},
    {"city_id": 88594, "city": "Youngstown", "state": "OH", "lat": 41.10, "lon": -80.65, "team_name": "Mahoning Valley Scrappers", "nickname": "Scrappers", "abbr": "MVS", "level": "MLB Draft League", "league": "MLB Draft League / Former NY-Penn League", "parent_abbr": "CLE", "park": "Eastwood Field", "capacity": 6000, "aliases": ["Niles", "Warren", "Canton"]},
    {"city_id": 45184, "city": "Lexington", "state": "KY", "lat": 38.04, "lon": -84.46, "team_name": "Lexington Legends", "nickname": "Legends", "abbr": "LEX", "level": "MLB Partner / Indie", "league": "Atlantic League / Former Single-A SAL", "parent_abbr": "KC", "park": "Legends Field", "capacity": 6994, "aliases": ["Frankfort", "Richmond"]},
    {"city_id": 57649, "city": "Orlando", "state": "FL", "lat": 28.51, "lon": -81.37, "team_name": "Orlando Rays / Dreamers", "nickname": "Dreamers", "abbr": "ORL", "level": "Historic Double-A", "league": "Southern League (Former AA) / MLB Expansion Bid", "parent_abbr": "TB", "park": "Tinker Field / Orlando Dreamers Dome", "capacity": 45000, "aliases": ["Kissimmee", "Sanford", "Winter Park"]},
    {"city_id": 50908, "city": "Mobile", "state": "AL", "lat": 30.68, "lon": -88.09, "team_name": "Mobile BayBears", "nickname": "BayBears", "abbr": "MOB", "level": "Historic Double-A", "league": "Southern League (Former AA)", "parent_abbr": "AZ", "park": "Hank Aaron Stadium", "capacity": 6000, "aliases": ["Daphne", "Fairhope"]},
    {"city_id": 34758, "city": "Jackson", "state": "MS", "lat": 32.32, "lon": -90.21, "team_name": "Mississippi Braves / Jackson Generals", "nickname": "Braves", "abbr": "MIS", "level": "Historic Double-A", "league": "Southern League (Former AA)", "parent_abbr": "ATL", "park": "Trustmark Park", "capacity": 8480, "aliases": ["Pearl", "Brandon"]},
    {"city_id": 71889, "city": "Savannah", "state": "GA", "lat": 32.02, "lon": -81.14, "team_name": "Savannah Sand Gnats / Bananas", "nickname": "Bananas", "abbr": "SAV", "level": "Historic Single-A", "league": "South Atlantic League / Premier Exhibition", "parent_abbr": "NYM", "park": "Grayson Stadium", "capacity": 5000, "aliases": ["Hilton Head", "Pooler"]},
    {"city_id": 24313, "city": "Evansville", "state": "IN", "lat": 37.99, "lon": -87.53, "team_name": "Evansville Otters / Triplets", "nickname": "Otters", "abbr": "EVA", "level": "MLB Partner / Indie", "league": "Frontier League / Former Triple-A AA", "parent_abbr": "DET", "park": "Bosse Field", "capacity": 5181, "aliases": ["Owensboro", "Henderson"]},
    {"city_id": 27881, "city": "Gary", "state": "IN", "lat": 41.59, "lon": -87.35, "team_name": "Gary SouthShore RailCats", "nickname": "RailCats", "abbr": "GAR", "level": "MLB Partner / Indie", "league": "American Association", "parent_abbr": "IND", "park": "U.S. Steel Yard", "capacity": 6139, "aliases": ["Hammond", "East Chicago", "Merrillville"]},
    {"city_id": 26414, "city": "Fargo", "state": "ND", "lat": 46.88, "lon": -96.83, "team_name": "Fargo-Moorhead RedHawks", "nickname": "RedHawks", "abbr": "FAR", "level": "MLB Partner / Indie", "league": "American Association", "parent_abbr": "IND", "park": "Newman Outdoor Field", "capacity": 4513, "aliases": ["Moorhead", "Grand Forks", "Bismarck"]},
    {"city_id": 74316, "city": "Sioux Falls", "state": "SD", "lat": 43.54, "lon": -96.73, "team_name": "Sioux Falls Canaries", "nickname": "Canaries", "abbr": "SFC", "level": "MLB Partner / Indie", "league": "American Association", "parent_abbr": "IND", "park": "Sioux Falls Stadium", "capacity": 4500, "aliases": ["Rapid City", "Brookings"]},
    {"city_id": 45562, "city": "Lincoln", "state": "NE", "lat": 40.82, "lon": -96.69, "team_name": "Lincoln Saltdogs", "nickname": "Saltdogs", "abbr": "LIN", "level": "MLB Partner / Indie", "league": "American Association", "parent_abbr": "IND", "park": "Haymarket Park", "capacity": 8486, "aliases": ["Grand Island", "Kearney"]},
    {"city_id": 14578, "city": "Colorado Springs", "state": "CO", "lat": 38.87, "lon": -104.76, "team_name": "Colorado Springs Sky Sox / Vibes", "nickname": "Sky Sox", "abbr": "COS", "level": "Historic Triple-A", "league": "Pioneer League / Former Triple-A PCL", "parent_abbr": "COL", "park": "UCHealth Park", "capacity": 8500, "aliases": ["Pueblo", "Fort Collins"]},
    {"city_id": 10388, "city": "Boise", "state": "ID", "lat": 43.61, "lon": -116.23, "team_name": "Boise Hawks", "nickname": "Hawks", "abbr": "BOI", "level": "MLB Partner / Indie", "league": "Pioneer League / Former NWL", "parent_abbr": "COL", "park": "Memorial Stadium", "capacity": 3452, "aliases": ["Nampa", "Meridian", "Idaho Falls"]},
    {"city_id": 9506, "city": "Billings", "state": "MT", "lat": 45.79, "lon": -108.54, "team_name": "Billings Mustangs", "nickname": "Mustangs", "abbr": "BIL", "level": "MLB Partner / Indie", "league": "Pioneer League", "parent_abbr": "CIN", "park": "Dehler Park", "capacity": 3071, "aliases": ["Bozeman", "Helena"]},
    {"city_id": 50729, "city": "Missoula", "state": "MT", "lat": 46.87, "lon": -114.01, "team_name": "Missoula PaddleHeads / Osprey", "nickname": "PaddleHeads", "abbr": "MSO", "level": "MLB Partner / Indie", "league": "Pioneer League", "parent_abbr": "AZ", "park": "Ogren Park at Allegiance Field", "capacity": 3500, "aliases": ["Great Falls", "Kalispell"]},
    {"city_id": 56909, "city": "Ogden", "state": "UT", "lat": 41.23, "lon": -111.97, "team_name": "Ogden Raptors", "nickname": "Raptors", "abbr": "OGD", "level": "MLB Partner / Indie", "league": "Pioneer League", "parent_abbr": "LAD", "park": "Lindquist Field", "capacity": 8262, "aliases": ["Provo", "Orem", "Logan"]},
    {"city_id": 86862, "city": "Winnipeg", "state": "MB", "lat": 49.88, "lon": -97.17, "team_name": "Winnipeg Goldeyes", "nickname": "Goldeyes", "abbr": "WPG", "level": "MLB Partner / Indie", "league": "American Association", "parent_abbr": "IND", "park": "Blue Cross Park", "capacity": 7461, "aliases": ["Brandon"]},
    {"city_id": 16637, "city": "Calgary", "state": "AB", "lat": 51.08, "lon": -114.08, "team_name": "Calgary Cannons", "nickname": "Cannons", "abbr": "CGY", "level": "Historic Triple-A", "league": "Pacific Coast League (Former AAA)", "parent_abbr": "SEA", "park": "Foothills Stadium", "capacity": 6000, "aliases": ["Red Deer", "Lethbridge"]},
    {"city_id": 22795, "city": "Edmonton", "state": "AB", "lat": 53.55, "lon": -113.50, "team_name": "Edmonton Trappers / Riverhawks", "nickname": "Trappers", "abbr": "EDM", "level": "Historic Triple-A", "league": "Pacific Coast League (Former AAA)", "parent_abbr": "LAA", "park": "RE/MAX Field", "capacity": 9200, "aliases": ["St. Albert"]},
    {"city_id": 63789, "city": "Quebec City", "state": "QC", "lat": 46.80, "lon": -71.25, "team_name": "Québec Capitales", "nickname": "Capitales", "abbr": "QUE", "level": "MLB Partner / Indie", "league": "Frontier League / Former Eastern League", "parent_abbr": "MON", "park": "Stade Canac", "capacity": 4300, "aliases": ["Quebec", "Trois-Rivières", "Sherbrooke"]},
    {"city_id": 51496, "city": "Monterrey", "state": "NUE", "lat": 25.67, "lon": -100.32, "team_name": "Sultanes de Monterrey", "nickname": "Sultanes", "abbr": "MTY", "level": "International Pro", "league": "Liga Mexicana de Béisbol (LMB)", "parent_abbr": "LMB", "park": "Estadio Mobil Super", "capacity": 21906, "aliases": ["Saltillo", "San Pedro"]},
    {"city_id": 49935, "city": "Mexico City", "state": "DIS", "lat": 19.43, "lon": -99.14, "team_name": "Diablos Rojos del México", "nickname": "Diablos Rojos", "abbr": "MEX", "level": "International Pro", "league": "Liga Mexicana de Béisbol (LMB)", "parent_abbr": "LMB", "park": "Estadio Alfredo Harp Helú", "capacity": 20576, "aliases": ["Ciudad de Mexico", "Ecatepec", "Puebla"]},
    {"city_id": 27028, "city": "Guadalajara", "state": "JAL", "lat": 20.67, "lon": -103.35, "team_name": "Charros de Jalisco", "nickname": "Charros", "abbr": "GDL", "level": "International Pro", "league": "Liga Mexicana de Béisbol / LMP", "parent_abbr": "LMB", "park": "Estadio Panamericano", "capacity": 16500, "aliases": ["Zapopan"]},
    {"city_id": 79944, "city": "Tijuana", "state": "BAJ", "lat": 32.50, "lon": -117.00, "team_name": "Toros de Tijuana", "nickname": "Toros", "abbr": "TIJ", "level": "International Pro", "league": "Liga Mexicana de Béisbol (LMB)", "parent_abbr": "LMB", "park": "Estadio Chevron", "capacity": 17000, "aliases": ["Mexicali", "Ensenada"]},
    {"city_id": 70279, "city": "San Juan", "state": "SAN", "lat": 18.47, "lon": -66.12, "team_name": "Cangrejeros de Santurce / Senadores", "nickname": "Senadores", "abbr": "SJU", "level": "International Pro", "league": "LBPRC / Historic MLB Expos Home (2003–04)", "parent_abbr": "PUR", "park": "Estadio Hiram Bithorn", "capacity": 18264, "aliases": ["Bayamon", "Carolina", "Ponce", "Caguas"]},
    {"city_id": 71432, "city": "Santo Domingo", "state": "DIS", "lat": 18.48, "lon": -69.90, "team_name": "Tigres del Licey / Leones del Escogido", "nickname": "Tigres", "abbr": "SDO", "level": "International Pro", "league": "Liga de Béisbol Profesional (LIDOM)", "parent_abbr": "DOM", "park": "Estadio Quisqueya Juan Marichal", "capacity": 14469, "aliases": ["San Cristobal", "La Romana", "San Pedro de Macoris"]},
    {"city_id": 31031, "city": "Havana", "state": "LA", "lat": 23.13, "lon": -82.38, "team_name": "Industriales / Havana Sugar Kings", "nickname": "Sugar Kings", "abbr": "HAV", "level": "Historic Triple-A", "league": "International League (1954–60) / Serie Nacional", "parent_abbr": "CIN", "park": "Estadio Latinoamericano", "capacity": 55000, "aliases": ["La Habana", "Matanzas"]},
    {"city_id": 17321, "city": "Caracas", "state": "DIS", "lat": 10.50, "lon": -66.92, "team_name": "Leones del Caracas", "nickname": "Leones", "abbr": "CCS", "level": "International Pro", "league": "Liga Venezolana de Béisbol Profesional (LVBP)", "parent_abbr": "VEN", "park": "Estadio Monumental Simón Bolívar", "capacity": 38000, "aliases": ["Valencia", "Maracaibo", "Maracay"]},
]

_CACHED_REGISTRY = None
_CACHED_REF_POPS = None


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    try:
        if not lat1 or not lon1 or not lat2 or not lon2:
            return 9999.0
        r = 3958.8
        p1 = math.radians(float(lat1))
        p2 = math.radians(float(lat2))
        dp = math.radians(float(lat2) - float(lat1))
        dl = math.radians(float(lon2) - float(lon1))
        a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
        return 2.0 * r * math.asin(min(1.0, math.sqrt(a)))
    except Exception:
        return 9999.0


def get_reference_city_populations() -> dict:
    """
    Loads standard unscaled OOTP city populations from main_game.db or david_mcmonigle.db
    so custom/Ashes state-scaled saves can accurately normalize national city populations
    without state-multiplier distortion.
    """
    global _CACHED_REF_POPS
    if _CACHED_REF_POPS is not None:
        return _CACHED_REF_POPS

    by_id = {}
    by_name_state = {}
    state_max = {}

    candidate_dbs = [SAVES_DB_DIR / "main_game.db", SAVES_DB_DIR / "david_mcmonigle.db"]
    if SAVES_DB_DIR.is_dir():
        for extra_db in sorted(SAVES_DB_DIR.glob("*.db")):
            if extra_db not in candidate_dbs and not extra_db.name.endswith(".tmp.db"):
                candidate_dbs.append(extra_db)

    for db_path in candidate_dbs:
        if not db_path.exists():
            continue
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT c.city_id, c.name, CAST(c.population AS INTEGER) as pop, s.abbreviation as state_abbr
                FROM cities c
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                WHERE CAST(c.population AS INTEGER) >= 5000
                """
            ).fetchall()
            conn.close()
            for r in rows:
                cid = int(r["city_id"] or 0)
                pop = int(r["pop"] or 0)
                cname = (r["name"] or "").strip().lower()
                st = (r["state_abbr"] or "").strip().upper()
                if cid > 0 and pop > 0:
                    by_id[cid] = pop
                if cname and pop > by_name_state.get((cname, st), 0):
                    by_name_state[(cname, st)] = pop
                if st and pop > state_max.get(st, 0):
                    state_max[st] = pop
            if by_id:
                break
        except Exception:
            pass

    _CACHED_REF_POPS = {
        "by_id": by_id,
        "by_name_state": by_name_state,
        "state_max": state_max,
    }
    return _CACHED_REF_POPS


def get_irl_counterparts_registry() -> list[dict]:
    """
    Returns the complete Real-Life MLB, Triple-A, Double-A, High-A, Single-A, Partner/Independent,
    MLB Draft League, International Pro, and Historic MLB/MiLB counterpart registry.
    Merges CURATED_COUNTERPARTS with all 150 MLB & full-season MiLB teams from main_game.db / david_mcmonigle.db.
    """
    global _CACHED_REGISTRY
    if _CACHED_REGISTRY is not None:
        return _CACHED_REGISTRY

    registry = list(CURATED_COUNTERPARTS)
    seen_keys = {(item["team_name"].lower(), item["level"]) for item in registry}

    for ref_db_name in ("main_game.db", "david_mcmonigle.db"):
        db_path = SAVES_DB_DIR / ref_db_name
        if not db_path.exists():
            continue
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT t.team_id, t.name, t.nickname, t.abbr, t.level, t.league_id,
                       pt.name || ' ' || pt.nickname as parent_name, pt.abbr as parent_abbr,
                       l.name as lg_name, l.abbr as lg_abbr,
                       c.city_id, c.name as city_name, s.abbreviation as state_abbr,
                       c.latitude, c.longitude,
                       p.name as park_name, p.capacity
                FROM teams t
                LEFT JOIN teams pt ON t.parent_team_id = pt.team_id
                LEFT JOIN leagues l ON t.league_id = l.league_id
                LEFT JOIN cities c ON t.city_id = c.city_id
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN parks p ON t.park_id = p.park_id
                WHERE t.allstar_team = 0 AND t.level <= 5
                ORDER BY t.level ASC, t.league_id ASC, t.name ASC
                """
            ).fetchall()
            conn.close()
            for r in rows:
                d = dict(r)
                lvl = int(d["level"] or 1)
                lid = int(d["league_id"] or 203)
                if lvl == 1:
                    lvl_label = "MLB"
                elif lvl == 2:
                    lvl_label = "Triple-A"
                elif lvl == 3:
                    lvl_label = "Double-A"
                elif lid in (209, 210, 211):
                    lvl_label = "High-A"
                else:
                    lvl_label = "Single-A"
                full_name = f"{d['name']} {d['nickname']}".strip()
                if d["name"] == d["nickname"]:
                    full_name = f"Sacramento / Oakland {d['nickname']}"
                tkey = (full_name.lower(), lvl_label)
                if tkey in seen_keys:
                    continue
                seen_keys.add(tkey)
                cname = d["city_name"] or d["name"]
                st_abbr = d["state_abbr"] or ""
                cid = int(d["city_id"] or 0)
                lat = round(float(d["latitude"] or 0.0), 4)
                lon = round(float(d["longitude"] or 0.0), 4)
                if d["nickname"] == "Clingstones":
                    cname, st_abbr, cid, lat, lon = "Columbus", "GA", 14616, 32.461, -84.988
                aliases = METRO_ALIASES.get(cname, [])
                registry.append({
                    "city_id": cid,
                    "city": cname,
                    "state": st_abbr,
                    "lat": lat,
                    "lon": lon,
                    "team_name": full_name,
                    "nickname": d["nickname"],
                    "abbr": d["abbr"],
                    "level": lvl_label,
                    "league": f"{d['lg_name']} ({d['lg_abbr']})",
                    "parent_abbr": d["parent_abbr"] or "MLB",
                    "park": (d["park_name"] or "Ballpark").strip(),
                    "capacity": int(d["capacity"] or 10000),
                    "aliases": aliases,
                })
            break
        except Exception:
            pass

    _CACHED_REGISTRY = registry
    return _CACHED_REGISTRY


def lookup_irl_counterparts(
    city_id: int = 0,
    city_name: str = "",
    state_abbr: str = "",
    lat: float = 0.0,
    lon: float = 0.0,
    active_city_names: set[str] | None = None,
) -> dict:
    """
    Matches any candidate expansion city against real-life MLB, Triple-A, Double-A, High-A, Single-A,
    MLB Partner/Independent, MLB Draft League, International Pro, and Historic franchises.
    Supports exact city_id, exact (city_name, state_abbr), metro alias matching, and <=16 mile proximity matching.
    """
    registry = get_irl_counterparts_registry()
    cname_clean = (city_name or "").strip().lower()
    st_clean = (state_abbr or "").strip().upper()
    matched = []
    seen_teams = set()

    # Pass 1: Exact city_id or Exact (city_name, state)
    for item in registry:
        tkey = (item["team_name"].lower(), item["level"])
        if tkey in seen_teams:
            continue
        item_city_low = item["city"].strip().lower()
        aliases_low = [a.lower() for a in item.get("aliases", [])]
        exact_id = (
            bool(city_id and item.get("city_id") == city_id)
            and (not cname_clean or item_city_low == cname_clean or cname_clean in aliases_low)
        )
        exact_name = (
            bool(cname_clean)
            and item_city_low == cname_clean
            and (not st_clean or not item["state"] or item["state"].upper() == st_clean)
        )
        if exact_id or exact_name:
            seen_teams.add(tkey)
            matched.append({**item, "match_type": "Exact City", "distance_mi": 0.0})

    # Pass 2: Metro Alias or Regional Proximity (<= 16 miles)
    for item in registry:
        tkey = (item["team_name"].lower(), item["level"])
        if tkey in seen_teams:
            continue
        item_city_low = item["city"].strip().lower()
        # Do not let surrounding suburbs hijack an IRL counterpart whose home city already hosts an active club in the league
        if active_city_names and item_city_low in active_city_names and item_city_low != cname_clean:
            continue
        aliases_low = [a.lower() for a in item.get("aliases", [])]
        state_ok = (not st_clean or not item["state"] or item["state"].upper() == st_clean)
        if cname_clean and cname_clean in aliases_low and state_ok:
            seen_teams.add(tkey)
            matched.append({**item, "match_type": f"Metro ({item['city']})", "distance_mi": 5.0})
            continue
        if lat and lon and item.get("lat") and item.get("lon"):
            dist = haversine_miles(lat, lon, item["lat"], item["lon"])
            if dist <= 16.0:
                seen_teams.add(tkey)
                matched.append({
                    **item,
                    "match_type": f"Metro ({item['city']}, {dist:.0f} mi)",
                    "distance_mi": round(dist, 1),
                })

    matched.sort(
        key=lambda x: (
            x["match_type"] == "Exact City",
            LEVEL_PRIORITY.get(x["level"], 50),
            x.get("capacity", 0),
        ),
        reverse=True,
    )

    if not matched:
        return {
            "has_irl_counterpart": False,
            "primary_level": "Untapped Market",
            "irl_tier_score": 42,
            "counterparts": [],
            "summary_badge": "Untapped Market (No Current MLB/MiLB Club)",
            "detail_line": "Greenfield expansion market with no current MLB or affiliated Minor League tenant.",
            "suggested_nickname": None,
            "suggested_abbr": None,
            "suggested_park": None,
            "suggested_capacity": 28000,
        }

    top = matched[0]
    base_score = LEVEL_PRIORITY.get(top["level"], 65)
    if top["match_type"] != "Exact City":
        # If matched via Metro Alias (e.g. Moosic -> Scranton/WB, Allentown -> Lehigh Valley), keep high score;
        # if matched purely by 16-mile radius to a bigger neighbor (e.g. Mississauga -> Toronto), apply larger discount.
        if "," in top["match_type"]:
            base_score = max(52, base_score - 20)
        else:
            base_score = max(65, base_score - 5)
    if len(matched) > 1 and top["match_type"] == "Exact City":
        base_score = min(99, base_score + 3)

    aff_str = (
        f" • {top['parent_abbr']} Affil"
        if top["level"] in ("Triple-A", "Double-A", "High-A", "Single-A")
        and top.get("parent_abbr") not in ("MLB", "IND", "")
        else ""
    )
    metro_prefix = f"[{top['match_type']}] " if "," in top["match_type"] else ""
    summary_badge = f"{metro_prefix}{top['level']}: {top['team_name']}{aff_str}"
    if len(matched) > 1:
        summary_badge += f" (+{len(matched) - 1} more)"

    details = []
    for m in matched[:3]:
        p_info = (
            f" ({m['parent_abbr']} Affil)"
            if m["level"] in ("Triple-A", "Double-A", "High-A", "Single-A") and m.get("parent_abbr")
            else ""
        )
        m_tag = f" [{m['match_type']}]" if m["match_type"] != "Exact City" else ""
        details.append(f"[{m['level']}]{m_tag} {m['team_name']}{p_info} — {m['league']} @ {m['park']} ({m['capacity']:,} cap)")

    return {
        "has_irl_counterpart": True,
        "is_exact_city_counterpart": top["match_type"] == "Exact City" or ("," not in top["match_type"]),
        "primary_level": top["level"],
        "irl_tier_score": int(base_score),
        "counterparts": matched[:4],
        "summary_badge": summary_badge,
        "detail_line": " | ".join(details),
        "suggested_nickname": top["nickname"],
        "suggested_abbr": top["abbr"],
        "suggested_park": top["park"],
        "suggested_capacity": top["capacity"],
    }
