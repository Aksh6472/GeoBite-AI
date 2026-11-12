# StrayWatch

A standalone website for monitoring an area for street dogs. It finds dogs automatically in live camera video, satellite imagery and drone photos, and puts every sighting on a map so you can see how many dogs are around any spot.

Detection runs entirely in the viewer's browser (TensorFlow.js, COCO-SSD). Video and photos are never uploaded. Sightings are saved in that browser's local storage; there is no server or database.

## Demo data

On a first visit with nothing saved, StrayWatch loads demo data so every page shows a working example: 8 sample cameras at real Chennai locations (Pondy Bazaar, Tondiarpet fish market, Kasimedu harbour and others), about 2,000 sightings over 14 days with dawn and dusk peaks, 3 drone-photo scans and 2 satellite scans. Sighting pictures are 46 real photos of free-ranging dogs in India from Wikimedia Commons (CC0, CC BY and CC BY-SA), each checked by the dog detector and cropped around the dog; they were not taken at the sample cameras. Credits and licences are listed at `/credits` and in [`src/lib/demoPhotos.ts`](src/lib/demoPhotos.ts). Every sample record is flagged `demo` and marked in the UI. **Remove demo data** in the yellow banner deletes them all and keeps real detections. Generator: [`src/lib/demo.ts`](src/lib/demo.ts).

## Run

```bash
cd surveillance
npm install
npm run dev        # http://localhost:3001
```

Production: `npm run build && npm start`. The camera and location features need HTTPS (or `localhost`).

## Pages

| Route | What it does |
|---|---|
| `/` Dog map | All sightings on a map, coloured by how recent they are. Click anywhere and choose a radius to count the dogs in that area over the last hour, day, week or month. |
| `/cameras` Live cameras | Add cameras with their location, then watch them live. Every dog gets a box and a track ID, and each new dog is logged once with a picture. |
| `/satellite` Satellite & drone scan | Real Esri satellite imagery for any place. **Find dog hotspots here** pulls garbage sites, meat shops, markets, food stalls, vacant land and stations from OpenStreetMap and ranks 200 m squares. **Scan this view** stitches the imagery and runs the detector over it. **Scan a drone photo** counts dogs in an uploaded top-down photo. |
| `/sightings` | Every sighting with picture, time, source and location. Export CSV, back up and import JSON (merges without duplicates), delete. |

## Camera sources

| Source | Notes |
|---|---|
| This device's camera | Laptop webcam or phone camera. To use a phone as a camera, open the site on the phone. |
| Network video stream | HLS (`.m3u8`), MP4 or WebM. The server must allow CORS. RTSP does not play in browsers: put the camera behind a relay such as [MediaMTX](https://github.com/bluenviron/mediamtx), which serves RTSP cameras as HLS. |
| Network image | An MJPEG stream, or a snapshot JPEG reloaded every second. CORS is required. |
| Recorded video file | Analyse footage already recorded. |

On an HTTPS site, browsers block `http://` camera URLs. Use HTTPS on the camera or relay, or run StrayWatch locally on the same network.

## How counting works

- **Camera:** detections are linked across frames by a tracker (box overlap, with a fallback on centre distance). A dog counts only after it has been seen in 3 detections, which removes one-frame false alarms. Each confirmed track logs one sighting.
- **Area estimate:** the low number is the most dogs a camera saw at once, summed over the cameras in the area, plus the largest image scan. Those are certainly different dogs. The high number counts every track, so a dog that walks past twice counts twice. The true count lies between the two.

## Limits

- **Satellite cannot count dogs reliably.** The best free imagery is about 0.3 m per pixel, so a dog is 2 to 4 pixels long, and the image may be months old. Use satellite to find where dogs are likely to gather (the hotspot lookup), and use cameras or drone photos to count them.
- The detector is the general COCO-SSD model, not one trained on street dogs. The default "accurate" model downloads about 67 MB once. The "fast" model (18 MB) labelled clear dogs as "sheep" or "bear" in testing, so use it only on slow phones. It can miss dogs that are small, hidden or curled up, or two dogs lying together.
- Monitoring runs only while the Live cameras page is open.
- Data stays in one browser. Use Backup and Import to combine devices. A shared database would be the next step for a multi-user deployment.

## Data sources

- Satellite imagery: Esri World Imagery (attribution shown on the map)
- Hotspot places: OpenStreetMap contributors via the Overpass API (ODbL)
- Place search: OpenStreetMap Nominatim
- Detector: TensorFlow.js COCO-SSD (Apache-2.0)
