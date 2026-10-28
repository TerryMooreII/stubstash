-- Venue pins can now come from Wikidata coordinates or Photon (komoot's
-- OpenStreetMap geocoder), not only Nominatim.
alter type public.geo_source add value if not exists 'wikidata';
alter type public.geo_source add value if not exists 'photon';
