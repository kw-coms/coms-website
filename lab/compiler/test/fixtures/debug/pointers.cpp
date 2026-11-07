#line 1 "/fixture/sketch/sketch.ino"
int value = 1;
int * volatile pointer = &value;
const int *pointee = &value;
void * volatile opaque = &value;
void callback() {}
void (* volatile functionPointer)() = callback;
int matrix[3];
int (* volatile arrayPointer)[3] = &matrix;
int main() { *pointer += *pointee; functionPointer(); return *static_cast<int *>(opaque) + (*arrayPointer)[0]; }
