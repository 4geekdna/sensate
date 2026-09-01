# SensoryLab Chrome — Phase 1

SensoryLab Chrome is an installable Progressive Web App for WitMotion WT901BLE sensors. It is dependency-free and can be hosted directly on GitHub Pages.

## Included

- Real Web Bluetooth connection to WT901BLE service FFE5.
- FFE4 notification subscription and FFE9 command writes.
- Multiple sensors, separately selected through Chrome’s device chooser.
- Persistent user names and service configurations.
- Decoding for 0x61 IMU and 0x71 magnetic-field, quaternion, and temperature frames.
- Display, Relative Angle, and Engineering Stability services.
- Correct normalized relative-quaternion math with reference capture.
- Orientation-sway RMS and angular-velocity RMS stability metrics.
- Live Monitor.
- Incremental IndexedDB session recording.
- CSV and JSON metadata export.
- Connection and decoder diagnostics.
- Installable manifest, icons, and offline service worker.
- Two-sensor demo mode.
- Automated decoder, quaternion, and service tests.

## Supported browser targets

Physical WT901BLE connection is intended for current Chrome on:

- Android.
- macOS.
- Windows.
- ChromeOS.

Web Bluetooth requires HTTPS or localhost and a user gesture. The user must tap Add sensor and choose each sensor individually.

Chrome on iPhone and iPad does not expose Web Bluetooth. The interface and demo mode can be used there, but a WT901BLE cannot connect. iOS also does not provide Chrome’s normal PWA install prompt; a web app can instead be added manually through Safari, but that does not add Web Bluetooth support.

## Run locally

From the project directory:

~~~bash
npm test
npm run serve
~~~

Open <http://localhost:8080> in Chrome. Do not open index.html directly as a file; service workers and Web Bluetooth require a secure context, and localhost is treated as secure for development.

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository root.
3. Open repository Settings.
4. Select Pages.
5. Under Build and deployment, select Deploy from a branch.
6. Select the main branch and / (root), then Save.
7. Open the HTTPS Pages URL when deployment completes.

All asset paths, the manifest scope, and the service-worker scope are relative so the app can run from a GitHub Pages repository subpath.

## Install

### Android Chrome

1. Open the deployed HTTPS URL.
2. Use the in-app Install button when it appears, or open Chrome’s menu.
3. Select Install app or Add to Home screen.

### Desktop Chrome

1. Open the deployed HTTPS URL.
2. Select the install icon in the address bar, or open Chrome’s menu and select Install SensoryLab.

## First sensor test

1. Power on the WT901BLE.
2. Open Devices.
3. Tap Add sensor.
4. Select the WT901BLE in Chrome’s chooser.
5. Confirm that its state reaches ready.
6. Confirm packet count and packet rate increase.
7. Open Diagnostics if connection or decoding fails.
8. For desktop Chrome, inspect chrome://bluetooth-internals as an additional diagnostic.

## Important protocol note

The 0x71 decoder interprets bytes 2–3 as a little-endian register identifier and data beginning at byte 4, consistent with the recovered SensoryLab layout. Magnetic-field values are exported as raw signed values because the final physical unit was not established in the historical requirements. Validate these details with captured frames from the physical WT901BLE firmware before treating every measurement as production-verified.

## Data and privacy

- No account or server is used.
- Sensor samples and sessions remain in the current browser’s local storage and IndexedDB.
- CSV/JSON export is initiated by the user.
- Clearing site data removes names, services, and recorded sessions.
- Demo data is explicitly marked simulated.

## Phase 1 engineering limits

- Engineering Stability is not a medical or clinical score.
- Relative Angle is the smallest total 3D rotation between two normalized sensor orientations. It is not automatically a signed anatomical joint angle.
- Browser security requires choosing each Bluetooth device through Chrome.
- Bluetooth connections do not remain active when the page or installed PWA is fully terminated.
