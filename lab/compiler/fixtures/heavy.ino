#include <Wire.h>
#include <Servo.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_NeoPixel.h>

Servo motor;
LiquidCrystal_I2C display(0x27, 16, 2);
DHT sensor(2, DHT11);
Adafruit_NeoPixel pixels(8, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  motor.attach(9);
  display.init();
  display.backlight();
  sensor.begin();
  pixels.begin();
}

void loop() {
  float temperature = sensor.readTemperature();
  motor.write(temperature > 25 ? 90 : 0);
  display.setCursor(0, 0);
  display.print(temperature);
  pixels.setPixelColor(0, pixels.Color(8, 0, 0));
  pixels.show();
  delay(1000);
}
