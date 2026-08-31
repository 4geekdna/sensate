# Sensate

Hand-gesture studio for a **WITMOTION WT901BLE** strapped to the back of the hand.

Live site (after GitHub Pages is enabled on `main` / root):

**https://4geekdna.github.io/sensate/**

## What it does

1. Connects to WT901BLE over Web Bluetooth (same FFE5 / UART profiles as the Tone `wt901ble.html` viewer).
2. Streams 9-axis IMU: accel (g), gyro (°/s), roll / pitch / yaw.
3. Records labeled windows of advanced gestures.
4. Trains an on-device neural net with TensorFlow.js:
   - **1D CNN** — default, good at motion *shape*
   - **MLP** — smaller dense net
5. Runs live classification with temporal smoothing.

No server. Samples stay in `localStorage`. Dataset JSON can be exported / imported.

## Mount

Tape or strap the module to the **dorsum of the hand**, long axis toward the middle finger, same orientation every session. The network learns that body frame.

Suggested labels (already in the UI):

Rest · Wave · Circle · Flick · Chop · Twist · Punch · Figure-8 · Raise · Snap

Record the *path* of the motion, not only the end pose. Plan on 12–20 samples per class, mixed speeds.

## Browser support

| Client | Sensor | Train / classify |
|---|---|---|
| Desktop Chrome / Edge | Web Bluetooth | Yes |
| Android Chrome | Web Bluetooth | Yes |
| iPhone Safari / Chrome | **No BLE** | Demo IMU + imported JSON |

iOS does not expose Web Bluetooth. Use **Demo IMU** to exercise the net, or record on Android/desktop and Import dataset on the phone.

## Enable Pages

Repo settings → Pages → Deploy from branch → `main` → `/` (root).

## Files

- `index.html` — app
- `manifest.json` — Add to Home Screen
- `README.md` — this file
