#include <uv.h>

#include "v8.h"
#include "ivan.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Uint32Array;
using v8::Value;

namespace ivan {
namespace performance {

uint64_t timeOrigin = 0;
static double NS_PER_MS = 1000000;

static void now(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  uint64_t t = uv_hrtime() - timeOrigin;

  args.GetReturnValue().Set(v8::Number::New(isolate, (double) t / NS_PER_MS));
}

void Init(Local<Context> context, Local<Object> target) {
  timeOrigin = uv_hrtime();

  IVAN_SET_PROPERTY(context, target, "now", now);
  IVAN_SET_PROPERTY(context, target, "timeOrigin", (double) timeOrigin / NS_PER_MS);
}

}  // namespace performance
}  // namespace ivan

IVAN_REGISTER_INTERNAL(performance, ivan::performance::Init);
