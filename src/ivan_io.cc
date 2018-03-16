#include <v8.h>
#include "ivan.h"
#include <string>
#include <fstream>
#include <streambuf>

using namespace v8;

namespace ivan {
namespace io {

static void ReadFileSync(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<String> filename = info[0].As<String>();
  // Local<String> mode = info[1].As<String>();

  String::Utf8Value filename_utf8(isolate, filename);
  // String::Utf8Value mode_utf8(isolate, mode);
  
  std::ifstream ifs(*filename_utf8, std::ifstream::in);
  std::string str((std::istreambuf_iterator<char>(ifs)),
                 std::istreambuf_iterator<char>());

  info.GetReturnValue().Set(String::NewFromUtf8(isolate, str.c_str()));
}

static void Init(Isolate* isolate, Local<Object> target) {
  IVAN_INTERNAL_EXPOSE(target, ReadFileSync);
}

} // namespace io
} // namespace ivan

IVAN_REGISTER_INTERNAL(io, ivan::io::Init);
