#include <v8.h>
#include "ivan.h"

using namespace v8;

namespace ivan {
namespace io {

static void ReadFileSync(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<String> filename = info[0].As<String>();
  Local<String> mode = info[0].As<String>();

  String::Utf8Value filename_utf8(isolate, filename);
  String::Utf8Value mode_utf8(isolate, mode);

  char* buffer = 0;
  long length;
  FILE* f = fopen(*filename_utf8, *mode_utf8);

  if (f) {
    fseek(f, 0, SEEK_END);
    length = ftell(f);
    fseek(f, 0, SEEK_SET);
    buffer = (char*) malloc(length);
    if (buffer)
      fread(buffer, 1, length, f);
    fclose(f);

    Local<String> data = String::NewFromUtf8(isolate, buffer, NewStringType::kNormal, length).ToLocalChecked();
    info.GetReturnValue().Set(data);
  }
}

static void Init(Isolate* isolate, Local<Object> target) {
  IVAN_INTERNAL_EXPOSE(target, ReadFileSync);
}

} // namespace io
} // namespace ivan

IVAN_REGISTER_INTERNAL(io, ivan::io::Init);
