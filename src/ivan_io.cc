#include <sys/stat.h>
#include <string>
#include <fstream>
#include <streambuf>

#include <v8.h>
#include "ivan.h"

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;

namespace ivan {
namespace io {

static void ReadFileBad(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  String::Utf8Value path(isolate, info[0]);

  struct stat buf;
  if (stat(*path, &buf) == -1)
    return;

  std::ifstream t(*path);
  std::string str((std::istreambuf_iterator<char>(t)),
                   std::istreambuf_iterator<char>());

  info.GetReturnValue().Set(IVAN_STRING(isolate, str.c_str()));
}

void Init(Isolate* isolate, Local<Object> exports) {
  IVAN_SET_METHOD(isolate, exports, "readFileSync", ReadFileBad);
}

}  // namespace io
}  // namespace ivan

IVAN_REGISTER_INTERNAL(io, ivan::io::Init);
