// Demo data for the marketing page map (from the design's stubstash-data.js).
import type { MapVenue } from "@/lib/types";
import { milesBetween } from "@/lib/geo";

type Demo = [id: string, name: string, city: string, state: string | null, cc: string, lat: number, lng: number, visits: number, first: number, artists: string[]];

const rows: Demo[] = [
  ["msg", "Madison Square Garden", "New York", "NY", "US", 40.7505, -73.9934, 9, 2017, ["Phish"]],
  ["bksteel", "Brooklyn Steel", "Brooklyn", "NY", "US", 40.7193, -73.9389, 8, 2018, ["Japanese Breakfast", "LCD Soundsystem"]],
  ["redrocks", "Red Rocks Amphitheatre", "Morrison", "CO", "US", 39.6654, -105.2057, 5, 2019, ["Billy Strings"]],
  ["foresthills", "Forest Hills Stadium", "Queens", "NY", "US", 40.7186, -73.8475, 4, 2018, ["The National"]],
  ["dicks", "Dick's Sporting Goods Park", "Commerce City", "CO", "US", 39.8056, -104.8919, 4, 2019, ["Phish"]],
  ["radiocity", "Radio City Music Hall", "New York", "NY", "US", 40.76, -73.98, 3, 2017, ["Khruangbin"]],
  ["unionpool", "Union Pool", "Brooklyn", "NY", "US", 40.7148, -73.9512, 3, 2021, ["Hotline TNT"]],
  ["n930", "9:30 Club", "Washington", "DC", "US", 38.9179, -77.0236, 3, 2018, ["Wilco"]],
  ["merriweather", "Merriweather Post Pavilion", "Columbia", "MD", "US", 39.2096, -76.8616, 3, 2019, ["Pearl Jam"]],
  ["ryman", "Ryman Auditorium", "Nashville", "TN", "US", 36.1613, -86.7785, 2, 2022, ["Wilco"]],
  ["gorge", "The Gorge Amphitheatre", "George", "WA", "US", 47.1009, -119.9967, 2, 2022, ["Pearl Jam"]],
  ["bowl", "Hollywood Bowl", "Los Angeles", "CA", "US", 34.1122, -118.3391, 2, 2019, ["Billy Strings"]],
  ["fillmore", "The Fillmore", "San Francisco", "CA", "US", 37.784, -122.433, 2, 2022, ["Khruangbin"]],
  ["wrigley", "Wrigley Field", "Chicago", "IL", "US", 41.9484, -87.6553, 2, 2018, ["Pearl Jam"]],
  ["greek", "Greek Theatre", "Berkeley", "CA", "US", 37.8736, -122.2546, 1, 2023, ["The National"]],
  ["thalia", "Thalia Hall", "Chicago", "IL", "US", 41.8578, -87.6588, 1, 2023, ["Fontaines D.C."]],
  ["rah", "Royal Albert Hall", "London", null, "GB", 51.5009, -0.1774, 1, 2025, ["Fontaines D.C."]],
  ["forum", "Parc del Fòrum", "Barcelona", null, "ES", 41.4105, 2.2266, 1, 2025, ["Charli xcx"]],
  ["massey", "Massey Hall", "Toronto", "ON", "CA", 43.6542, -79.3791, 1, 2024, ["Wilco"]],
];

export const demoHome = { lat: 40.6782, lng: -73.9442, city: "Brooklyn, NY" };

function miles(lat: number, lng: number): number {
  return Math.round(milesBetween(demoHome.lat, demoHome.lng, lat, lng));
}

export const demoVenues: MapVenue[] = rows.map(([id, name, city, state, cc, lat, lng, visits, first, artists]) => ({
  venue_id: `demo-${id}`,
  name,
  city,
  state_code: state,
  country_code: cc,
  lat,
  lng,
  visits,
  first_year: first,
  last_year: 2026,
  recent_artists: artists,
  miles_from_home: miles(lat, lng),
  geo_source: "nominatim",
}));
