/*
 * ============================================================
 *  SMART HELMET — ESP32 Firmware
 *  Sensors : DHT22 (Temp + Humidity) | MQ-2 (Gas)
 *  Cloud   : Firebase Realtime Database (RTDB)
 * ============================================================
 *
 *  Libraries required (install via Arduino Library Manager):
 *    - Firebase ESP32 Client  by Mobizt   v4.x
 *    - DHT sensor library     by Adafruit
 *    - Adafruit Unified Sensor by Adafruit
 *
 *  Board: "ESP32 Dev Module"
 * ============================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <DHT.h>
#include <time.h>

// ── Wi-Fi Credentials ─────────────────────────────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// ── Firebase Config ───────────────────────────────────────────
#define FIREBASE_HOST   "mines-7b85e-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_AUTH   "YOUR_FIREBASE_DATABASE_SECRET"   // From Project Settings → Service accounts

// ── Pin Definitions ───────────────────────────────────────────
#define DHT_PIN         4         // GPIO4  → DHT22 Data
#define DHT_TYPE        DHT22
#define MQ2_PIN         34        // GPIO34 → MQ-2 Analog Out (ADC1 only!)
#define BUZZER_PIN      2         // GPIO2  → Active Buzzer (optional)
#define LED_RED_PIN     15        // GPIO15 → Red LED   (danger)
#define LED_GREEN_PIN   5         // GPIO5  → Green LED (safe)

// ── Thresholds ────────────────────────────────────────────────
#define TEMP_WARN       35.0f
#define TEMP_DANGER     45.0f
#define HUM_WARN        60.0f
#define HUM_DANGER      80.0f
#define GAS_WARN        200
#define GAS_DANGER      400

// ── Upload Interval ───────────────────────────────────────────
#define UPLOAD_INTERVAL_MS  3000   // 3 seconds

// ── Objects ───────────────────────────────────────────────────
FirebaseData   fbData;
FirebaseConfig fbConfig;
FirebaseAuth   fbAuth;
DHT            dht(DHT_PIN, DHT_TYPE);

unsigned long lastUpload = 0;
bool          alertActive = false;

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== SMART HELMET BOOT ===");

  // GPIO Setup
  pinMode(BUZZER_PIN,   OUTPUT);
  pinMode(LED_RED_PIN,  OUTPUT);
  pinMode(LED_GREEN_PIN,OUTPUT);
  digitalWrite(BUZZER_PIN,    LOW);
  digitalWrite(LED_RED_PIN,   LOW);
  digitalWrite(LED_GREEN_PIN, LOW);

  // DHT Init
  dht.begin();

  // Wi-Fi
  connectWiFi();

  // NTP Time
  configTime(19800, 0, "pool.ntp.org");   // UTC+5:30 for India
  Serial.print("Syncing NTP");
  while (time(nullptr) < 1000000000) { Serial.print("."); delay(500); }
  Serial.println(" OK");

  // Firebase
  fbConfig.host           = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  Serial.println("Firebase ready.");
  Serial.println("=========================\n");
}

// ─────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  if (now - lastUpload >= UPLOAD_INTERVAL_MS) {
    lastUpload = now;
    readAndUpload();
  }
}

// ─────────────────────────────────────────────────────────────
void readAndUpload() {

  // ── Read Sensors ──────────────────────────────────────────
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  if (isnan(temp) || isnan(hum)) {
    Serial.println("[ERROR] DHT22 read failed. Retrying...");
    delay(2000);
    temp = dht.readTemperature();
    hum  = dht.readHumidity();
    if (isnan(temp) || isnan(hum)) {
      Serial.println("[ERROR] DHT22 failed again. Skipping upload.");
      return;
    }
  }

  // MQ-2: read raw ADC (0–4095), map to PPM (rough calibration)
  int   rawGas  = analogRead(MQ2_PIN);
  float gasVolt = (rawGas / 4095.0f) * 3.3f;
  // Simple linear mapping — calibrate per sensor in real deployment
  int   gasPPM  = map(rawGas, 0, 4095, 0, 1000);

  // ── Timestamp ─────────────────────────────────────────────
  time_t     now_t  = time(nullptr);
  struct tm *tm_inf = localtime(&now_t);
  char timeStr[20];
  strftime(timeStr, sizeof(timeStr), "%H:%M:%S", tm_inf);

  // ── Serial Debug ──────────────────────────────────────────
  Serial.printf("[SENSOR] Temp: %.1f°C  Hum: %.1f%%  Gas: %d PPM  Time: %s\n",
                temp, hum, gasPPM, timeStr);

  // ── Alert Logic ───────────────────────────────────────────
  bool danger = (temp >= TEMP_DANGER || hum >= HUM_DANGER || gasPPM >= GAS_DANGER);
  bool warn   = (temp >= TEMP_WARN   || hum >= HUM_WARN   || gasPPM >= GAS_WARN);

  if (danger) {
    digitalWrite(LED_RED_PIN,   HIGH);
    digitalWrite(LED_GREEN_PIN, LOW);
    // Buzzer beep pattern for danger
    for (int i = 0; i < 3; i++) {
      digitalWrite(BUZZER_PIN, HIGH); delay(100);
      digitalWrite(BUZZER_PIN, LOW);  delay(80);
    }
    alertActive = true;
  } else if (warn) {
    digitalWrite(LED_RED_PIN,   HIGH);
    digitalWrite(LED_GREEN_PIN, HIGH);
    // Single short beep for warning
    digitalWrite(BUZZER_PIN, HIGH); delay(80);
    digitalWrite(BUZZER_PIN, LOW);
    alertActive = false;
  } else {
    digitalWrite(LED_RED_PIN,   LOW);
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(BUZZER_PIN,    LOW);
    alertActive = false;
  }

  // ── Upload to Firebase ────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Reconnecting...");
    connectWiFi();
    return;
  }

  bool ok = true;

  ok &= Firebase.setFloat(fbData,  "/Temp",      temp);
  ok &= Firebase.setFloat(fbData,  "/Hum",       hum);
  ok &= Firebase.setInt(fbData,    "/Gas",        gasPPM);
  ok &= Firebase.setString(fbData, "/Timestamp",  String(timeStr));

  if (ok) {
    Serial.println("[FIREBASE] Upload SUCCESS ✓");
  } else {
    Serial.print("[FIREBASE] Upload FAILED: ");
    Serial.println(fbData.errorReason());
  }
}

// ─────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] FAILED to connect. Will retry.");
  }
}
