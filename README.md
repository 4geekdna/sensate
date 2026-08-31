# Sensate

Browser tools for a **WITMOTION WT901BLE** IMU.

Live site (enable Pages on `main` / root if it is not already on):

**https://4geekdna.github.io/sensate/**

## Apps

| File | Placement | Method |
|---|---|---|
| `gait.html` | Lower back / pelvis | Cadence and step timing |
| `gesture.html` | Hand / wrist | Rule-based Rest / Wave / Flick / Punch / Twist + CSV |
| `gesture-nn.html` | Dorsum of hand | Record custom gestures, train 1D CNN or MLP in TensorFlow.js, live classify |

## Neural-net app

`gesture-nn.html` is the advanced gesture studio:

1. Web Bluetooth to WT901BLE (same FFE5 / UART profiles as Tone `wt901ble.html`).
2. 9-channel windows: accel, gyro (scaled), roll / pitch / yaw relative to a zero pose.
3. User-defined labels (defaults: Rest, Wave, Circle, Flick, Chop, Twist, Punch, Figure-8, Raise, Snap).
4. On-device training with time-shift / scale / noise augmentation.
5. Live softmax with temporal smoothing.
6. Dataset export / import as JSON. Samples persist in `localStorage`.

Mount: strap the module to the **back of the hand**, long axis toward the middle finger. Same orientation every session.

Plan on 12–20 samples per class at mixed speeds. Record the motion path, not only the end pose.

## Browser support

| Client | Sensor | Train / classify |
|---|---|---|
| Desktop Chrome / Edge | Web Bluetooth | Yes |
| Android Chrome | Web Bluetooth | Yes |
| iPhone Safari / Chrome | No BLE | Demo IMU + imported JSON |

## Enable Pages

Repo settings → Pages → Deploy from branch → `main` → `/` (root).
