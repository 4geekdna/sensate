# Sensate WT901BLE Gait Analyzer

Browser-based gait analysis for the WITMOTION WT901BLE IMU.

## Live app

https://4geekdna.github.io/sensate/

## Features

- Web Bluetooth connection to WT901BLE
- FFE5 / FFE4 / FFE9 BLE diagnostics
- 0x55 0x61 packet parser
- Live acceleration, gyro, and orientation
- Cadence and step timing
- Step-time variability and regularity
- Alternating-step timing symmetry proxy
- Walking simulation for testing without hardware
- CSV export for Python analysis

## Browser

Use Chrome or Edge on a desktop platform with Web Bluetooth support. The site must be served from HTTPS; GitHub Pages provides this automatically.

## Deployment

`.github/workflows/pages.yml` automatically deploys the site to GitHub Pages whenever `main` is updated.
