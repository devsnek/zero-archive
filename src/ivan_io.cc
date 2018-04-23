#include <string>
#include <fstream>
#include <streambuf>

#include <v8.h>
#include <uv.h>
#include "ivan.h"

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Promise;
using v8::String;
using v8::Value;

namespace ivan {
namespace io {

struct request {
  v8::Persistent<Promise::Resolver> resolver;
};

static void ReadFileSync(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  Local<String> js_path = args[0].As<String>();
  String::Utf8Value path(isolate, js_path);

  uv_fs_t open_req;
  uv_fs_open(uv_default_loop(), &open_req, *path, O_RDONLY, 0, nullptr);

  uv_fs_t read_req;
  static char buffer[256]; // TODO(devsnek): run stat and malloc
  uv_buf_t iov = uv_buf_init(buffer, sizeof(buffer));
  uv_fs_read(uv_default_loop(), &read_req, open_req.result, &iov, 1, -1, nullptr);

  uv_fs_t close_req;
  uv_fs_close(uv_default_loop(), &close_req, open_req.result, nullptr);

  args.GetReturnValue().Set(IVAN_STRING(isolate, buffer));
}

void ReadFile(const FunctionCallbackInfo<Value>& args) {}

void Init(Isolate* isolate, Local<Object> exports) {
  IVAN_SET_METHOD(isolate, exports, "readFileSync", ReadFileSync);
}

}  // namespace io
}  // namespace ivan

IVAN_REGISTER_INTERNAL(io, ivan::io::Init);
