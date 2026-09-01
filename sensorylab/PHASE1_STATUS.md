# Phase 1 implementation status

## Delivered

| Requirement area | Implementation |
| --- | --- |
| DEV-001–015 | Chrome Web Bluetooth manager, service/name filters, FFE5 discovery, FFE4 notifications, FFE9 writes, multi-device records, connection states, reconnect/forget actions, and user names |
| DATA-001–011 | Timestamped per-device decoder, 0x61 IMU frames, 0x71 magnetic/quaternion/temperature frames, invalid-frame counters, partial-frame buffering, packet rate, and magnetic-field request |
| SVC-001–015 | Persistent Display, Angle, and Stability services; assignment, editing, validation, ordering, activation, logging, and reference capture |
| UI-001–010 | Devices, Services, Monitor, Sessions, and Diagnostics views with explicit unavailable states |
| LOG-001–008 | Persistent settings, incremental IndexedDB recording, interrupted-session recovery, CSV export, and metadata JSON export |
| PWA installation | Relative manifest scope, 192/512 icons, standalone display, install UI, and offline service worker |

## Engineering decisions made

- The browser target is current Chrome on Android, macOS, Windows, and ChromeOS.
- Each physical sensor is selected separately because Web Bluetooth device discovery requires a user gesture and chooser.
- Relative Angle uses normalized quaternion inverse/multiplication and supports a captured two-sensor reference.
- Engineering Stability reports orientation-sway RMS in degrees and angular-velocity RMS in degrees/second over a selectable rolling window.
- Stability results are explicitly not labeled as clinical or medical scores.
- Magnetic-field values remain raw because the historical requirements did not establish the final physical unit.
- The application has no external JavaScript dependencies or backend service.

## Automated verification

- 16 Node tests pass.
- Test coverage includes IMU scaling, quaternion/temperature/magnetic decoding, unknown and partial frames, known quaternion rotations, q versus negative q, captured references, AngleService validation, and StabilityService units.
- Every JavaScript file passes Node syntax checking.
- The manifest parses as JSON.
- The 192×192 and 512×512 PNG install icons were generated and dimension-checked.
- The complete app, manifest, and service worker were served successfully over local HTTP.

## Physical acceptance still required

The following checks require the user’s actual WT901BLE hardware and cannot be completed in this build environment:

1. Confirm the sensor appears in Chrome’s chooser.
2. Confirm FFE5, FFE4, and FFE9 are exposed by the installed firmware.
3. Confirm notification boundaries and 20-byte layouts.
4. Capture raw packets for 0x61, 0x71/0x3A, 0x71/0x51, and 0x71/0x40.
5. Confirm magnetic-field physical units.
6. Compare angle output against known physical 30°, 45°, and 90° fixtures.
7. Record and export a real two-sensor session.

## Platform limitation

Chrome on iPhone and iPad does not expose Web Bluetooth. Demo mode and the interface can run there, but a physical WT901BLE cannot connect. Installing through Safari does not add Web Bluetooth support.
