# ⛑️ SMART HELMET — Mine Safety Monitor

Real-time environmental monitoring dashboard for mine workers using **ESP32 + Firebase RTDB**.

---

## 📁 Project Structure

```
smart-helmet/
├── index.html                      ← Web Dashboard (open in browser)
├── css/
│   └── style.css                   ← Industrial dark theme
├── js/
│   ├── app.js                      ← Firebase listener + UI logic
│   └── gauges.js                   ← Canvas radial gauges
└── SmartHelmet_ESP32/
    └── SmartHelmet_ESP32.ino       ← ESP32 Arduino firmware
```

---

## 🌐 Web Dashboard Setup

1. Open `index.html` in any modern browser.
2. The dashboard auto-connects to your Firebase RTDB.
3. No server needed — runs entirely in the browser.

> **Note:** Because `app.js` uses ES Modules (`import`), you need to serve via a local server or just open directly in Chrome/Edge/Firefox (most support file:// modules). If not working, use **VS Code Live Server** or `npx serve .`

---

## 🔧 ESP32 Firmware Setup

### Hardware Connections

| Component | ESP32 Pin |
|-----------|-----------|
| DHT22 Data | GPIO 4   |
| MQ-2 Analog Out | GPIO 34 (ADC) |
| Buzzer (+) | GPIO 2   |
| Red LED    | GPIO 15  |
| Green LED  | GPIO 5   |
| All GND    | GND      |
| DHT22 VCC  | 3.3V     |
| MQ-2 VCC   | 5V       |

### Arduino IDE Setup

1. Install **ESP32 board** via Board Manager  
   URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

2. Install Libraries (Sketch → Include Library → Manage Libraries):
   - `Firebase ESP32 Client` by Mobizt
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor` by Adafruit

3. Edit `SmartHelmet_ESP32.ino`:
   ```cpp
   #define WIFI_SSID       "YOUR_WIFI_SSID"
   #define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
   #define FIREBASE_AUTH   "YOUR_DATABASE_SECRET"
   ```
   
   Get `FIREBASE_AUTH` from:  
   Firebase Console → Project Settings → Service Accounts → Database Secrets

4. Select Board: **ESP32 Dev Module** → Upload

---

## 📊 Firebase RTDB Structure

```json
{
  "Gas":       150,
  "Hum":       55.3,
  "Temp":      32.1,
  "Timestamp": "14:32:05"
}
```

---

## 🚨 Alert Thresholds

| Parameter | Warning | Danger |
|-----------|---------|--------|
| Temperature | > 35°C | > 45°C |
| Humidity    | > 60%  | > 80%  |
| Gas (PPM)   | > 200  | > 400  |

---

## 🛠️ Safety Features

- **Real-time alerts** with banner on the dashboard
- **Buzzer + LED** alerts on the ESP32 hardware
- **Safety Score** (0–100) combining all sensor readings
- **Live sensor log** (last 50 readings)
- **Connection status** indicator (LIVE / OFFLINE)
