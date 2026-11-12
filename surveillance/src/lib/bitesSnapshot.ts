/**
 * Copy of GeoBite-AI's public ward bite summary (/api/map/public/bites), used when the live
 * API cannot be reached. GeoBite-AI's data is synthetic demonstration data. Counts below the
 * suppression threshold are hidden (null) to protect privacy.
 */
import type { BiteWard } from "./bites";

export const BITES_SNAPSHOT_AT = "2026-11-12";
export const BITES_SNAPSHOT: { suppression_threshold: number; wards: BiteWard[] } = {
 "suppression_threshold": 3,
 "wards": [
  {
   "ward": "T. Nagar",
   "district": "Chennai",
   "lat": 13.0418,
   "lng": 80.2341,
   "bites": 6,
   "suppressed": false
  },
  {
   "ward": "Adyar",
   "district": "Chennai",
   "lat": 13.0012,
   "lng": 80.2565,
   "bites": 10,
   "suppressed": false
  },
  {
   "ward": "Mylapore",
   "district": "Chennai",
   "lat": 13.0339,
   "lng": 80.2619,
   "bites": 19,
   "suppressed": false
  },
  {
   "ward": "Anna Nagar",
   "district": "Chennai",
   "lat": 13.085,
   "lng": 80.2101,
   "bites": 10,
   "suppressed": false
  },
  {
   "ward": "Velachery",
   "district": "Chennai",
   "lat": 12.9815,
   "lng": 80.218,
   "bites": 23,
   "suppressed": false
  },
  {
   "ward": "Tondiarpet",
   "district": "Chennai",
   "lat": 13.126,
   "lng": 80.288,
   "bites": 20,
   "suppressed": false
  },
  {
   "ward": "Royapuram",
   "district": "Chennai",
   "lat": 13.1137,
   "lng": 80.2954,
   "bites": 12,
   "suppressed": false
  },
  {
   "ward": "Perambur",
   "district": "Chennai",
   "lat": 13.121,
   "lng": 80.233,
   "bites": 10,
   "suppressed": false
  },
  {
   "ward": "Fairlands",
   "district": "Salem",
   "lat": 11.678,
   "lng": 78.136,
   "bites": 16,
   "suppressed": false
  },
  {
   "ward": "Hasthampatti",
   "district": "Salem",
   "lat": 11.672,
   "lng": 78.155,
   "bites": 16,
   "suppressed": false
  },
  {
   "ward": "Suramangalam",
   "district": "Salem",
   "lat": 11.674,
   "lng": 78.11,
   "bites": 5,
   "suppressed": false
  },
  {
   "ward": "Ammapet",
   "district": "Salem",
   "lat": 11.652,
   "lng": 78.172,
   "bites": 22,
   "suppressed": false
  },
  {
   "ward": "Shevapet",
   "district": "Salem",
   "lat": 11.655,
   "lng": 78.155,
   "bites": 10,
   "suppressed": false
  },
  {
   "ward": "Kondalampatti",
   "district": "Salem",
   "lat": 11.625,
   "lng": 78.13,
   "bites": 7,
   "suppressed": false
  },
  {
   "ward": "Katpadi",
   "district": "Vellore",
   "lat": 12.969,
   "lng": 79.145,
   "bites": 9,
   "suppressed": false
  },
  {
   "ward": "Sathuvachari",
   "district": "Vellore",
   "lat": 12.937,
   "lng": 79.159,
   "bites": 14,
   "suppressed": false
  },
  {
   "ward": "Gandhi Nagar",
   "district": "Vellore",
   "lat": 12.955,
   "lng": 79.133,
   "bites": 17,
   "suppressed": false
  },
  {
   "ward": "Bagayam",
   "district": "Vellore",
   "lat": 12.889,
   "lng": 79.136,
   "bites": 11,
   "suppressed": false
  },
  {
   "ward": "Fort Area",
   "district": "Vellore",
   "lat": 12.92,
   "lng": 79.13,
   "bites": 13,
   "suppressed": false
  },
  {
   "ward": "Thorapadi",
   "district": "Vellore",
   "lat": 12.9,
   "lng": 79.15,
   "bites": 15,
   "suppressed": false
  },
  {
   "ward": "Tallakulam",
   "district": "Madurai",
   "lat": 9.94,
   "lng": 78.133,
   "bites": 12,
   "suppressed": false
  },
  {
   "ward": "Simmakkal",
   "district": "Madurai",
   "lat": 9.923,
   "lng": 78.122,
   "bites": 20,
   "suppressed": false
  },
  {
   "ward": "Mattuthavani",
   "district": "Madurai",
   "lat": 9.945,
   "lng": 78.157,
   "bites": 8,
   "suppressed": false
  },
  {
   "ward": "Thiruparankundram",
   "district": "Madurai",
   "lat": 9.88,
   "lng": 78.07,
   "bites": 11,
   "suppressed": false
  },
  {
   "ward": "Villapuram",
   "district": "Madurai",
   "lat": 9.899,
   "lng": 78.117,
   "bites": 12,
   "suppressed": false
  },
  {
   "ward": "Anaiyur",
   "district": "Madurai",
   "lat": 9.962,
   "lng": 78.111,
   "bites": 7,
   "suppressed": false
  },
  {
   "ward": "Avaniyapuram",
   "district": "Madurai",
   "lat": 9.88,
   "lng": 78.115,
   "bites": 9,
   "suppressed": false
  },
  {
   "ward": "Srirangam",
   "district": "Tiruchirappalli",
   "lat": 10.862,
   "lng": 78.693,
   "bites": 4,
   "suppressed": false
  },
  {
   "ward": "Thillai Nagar",
   "district": "Tiruchirappalli",
   "lat": 10.825,
   "lng": 78.683,
   "bites": 12,
   "suppressed": false
  },
  {
   "ward": "Cantonment",
   "district": "Tiruchirappalli",
   "lat": 10.796,
   "lng": 78.688,
   "bites": 14,
   "suppressed": false
  },
  {
   "ward": "Ponmalai",
   "district": "Tiruchirappalli",
   "lat": 10.792,
   "lng": 78.728,
   "bites": 39,
   "suppressed": false
  },
  {
   "ward": "K.K. Nagar",
   "district": "Tiruchirappalli",
   "lat": 10.768,
   "lng": 78.71,
   "bites": 14,
   "suppressed": false
  },
  {
   "ward": "Thiruverumbur",
   "district": "Tiruchirappalli",
   "lat": 10.774,
   "lng": 78.779,
   "bites": 10,
   "suppressed": false
  },
  {
   "ward": "Woraiyur",
   "district": "Tiruchirappalli",
   "lat": 10.83,
   "lng": 78.66,
   "bites": 8,
   "suppressed": false
  }
 ]
};
