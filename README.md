# Sensate

Browser-based WITMOTION WT901BLE tools: generic IMU viewers, gait analysis, and hand-gesture recording. Static HTML, no build step, no backend.

## Live apps

- Hub: https://4geekdna.github.io/sensate/
- Gait Analyzer: https://4geekdna.github.io/sensate/gait.html
- Hand Gestures: https://4geekdna.github.io/sensate/gesture.html
- Gesture Neural Net: https://4geekdna.github.io/sensate/gesture-nn.html
- SensoryLab Phase 1: https://4geekdna.github.io/sensate/sensorylab/
- Wit IMU: https://4geekdna.github.io/sensate/sensor-wit.html
- Wit IMUs: https://4geekdna.github.io/sensate/sensor-wits.html
- WT901BLE diagnostics: https://4geekdna.github.io/sensate/wt901ble.html

## Wit IMU / Wit IMUs

`sensor-wit.html` — single WT901BLE. Live roll/pitch/yaw, accel, gyro, and a 3D cube. Mag, quaternion, and temperature on request.

`sensor-wits.html` — several WT901s at once. Each Add sensor opens another picker and a live cube.

## WT901BLE diagnostics

`wt901ble.html` — Chrome Web Bluetooth diagnostics: GATT profiles, packet rate, raw BLE log, and zero/reference orientation.

## Gait Analyzer

`gait.html` — IMU on the **lower back / pelvis**.

- Web Bluetooth connection to WT901BLE
- FFE5 / FFE4 / FFE9 BLE diagnostics
- 0x55 0x61 packet parser
- Live acceleration, gyro, and orientation
- Cadence and step timing
- Step-time variability and regularity
- Alternating-step timing symmetry proxy
- Walking simulation for testing without hardware
- CSV export for Python analysis

## Hand Gestures

`gesture.html` — IMU on the **back of the hand or wrist**. Keep orientation fixed during a take.

- Same BLE stack, live IMU table, diagnostics, session control, and CSV export as gait
- Accel-magnitude and gyro-magnitude charts
- Live detector for Rest, Wave, Flick, Punch, and Twist (threshold / pattern on accel, gyro, and orientation)
- In-browser learner: labeled ~500 ms windows, softmax classifier, stored in this browser
- Train from a session (or Simulate Gestures, which auto-labels) then Use learner for live detection; rules remain the low-confidence fallback
- Import a previous CSV to add training windows; Clear examples wipes the local model
- Confidence-like score, recent-event log, and per-gesture counts
- Manual label buttons (including Custom) that stamp `gesture_label` on incoming samples
- Simulate Gestures for UI testing without hardware
- Detector settings: punch / flick / rest / twist thresholds, minimum interval, smoothing
- Session summary: duration, samples, detected counts, peak accel, peak gyro

CSV columns: `time_s, ax_g, ay_g, az_g, gx_dps, gy_dps, gz_dps, roll_deg, pitch_deg, yaw_deg, accel_mag_g, gyro_mag_dps, gesture_label, detected_gesture`

## Browser

Use Chrome or Edge on a desktop platform with Web Bluetooth support. The site must be served from HTTPS; GitHub Pages provides this automatically.

## WT901BLE frames

- Name filter prefix: `WT`
- Service `0000ffe5-0000-1000-8000-00805f9a34fb`
- Notify `0000ffe4-0000-1000-8000-00805f9a34fb`
- Write `0000ffe9-0000-1000-8000-00805f9a34fb`
- 20-byte frames starting `0x55 0x61`
- Accel: s16/32768×16 g; gyro: s16/32768×2000 dps; angles: s16/32768×180 deg

## Deployment

`.github/workflows/pages.yml` automatically deploys the site to GitHub Pages whenever `main` is updated.
