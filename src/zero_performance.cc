#include <uv.h>

#include "v8.h"
#include "zero.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Uint32Array;
using v8::Value;

namespace zero {
namespace performance {

uint64_t timeOrigin = 0;
static const double NS_PER_MS = 1000000;

static void Now(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  uint64_t now64 = uv_hrtime() - timeOrigin;
  double now = static_cast<double>(now64) / NS_PER_MS;

  // decrease precision for wpt/performance-timeline/webtiming-resolution.any.js
  now = floor(now * 10) / 10;

  args.GetReturnValue().Set(v8::Number::New(isolate, now));
}

void Init(Local<Context> context, Local<Object> target) {
  timeOrigin = uv_hrtime();

  ZERO_SET_PROPERTY(context, target, "now", Now);
  ZERO_SET_PROPERTY(context, target, "timeOrigin", static_cast<double>(timeOrigin) / NS_PER_MS);
}

}  // namespace performance
}  // namespace zero

ZERO_REGISTER_INTERNAL(performance, zero::performance::Init);
