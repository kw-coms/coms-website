#include <stdint.h>
#line 1 "/fixture/sketch/sketch.ino"
volatile int counter = 3;
static volatile uint8_t leds[3] = {1, 2, 3};
volatile float temperature = 24.5;
const char *message = "hello";
void setup();
void loop();
#line 5 "/fixture/sketch/sketch.ino"
void setup() { counter = 0; }
void loop() {
  counter++;
  leds[counter % 3]++;
  temperature += 0.5;
}
#line 1 "/fixture/core/main.cpp"
volatile int coreGlobal = 2;
int main() { setup(); for (;;) { loop(); coreGlobal++; } }
