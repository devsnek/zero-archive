#include <uv.h>

#include "v8.h"
#include "edge.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Uint32Array;
using v8::Value;

namespace edge {
namespace performance {

uint64_t timeOrigin = 0;
static double NS_PER_MS = 1000000;

static void now(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  uint64_t t = uv_hrtime() - timeOrigin;

  args.GetReturnValue().Set(v8::Number::New(isolate, static_cast<double>(t) / NS_PER_MS));
}

void Init(Local<Context> context, Local<Object> target) {
  timeOrigin = uv_hrtime();

  EDGE_SET_PROPERTY(context, target, "now", now);
  EDGE_SET_PROPERTY(context, target, "timeOrigin", static_cast<double>(timeOrigin) / NS_PER_MS);
}

}  // namespace performance
}  // namespace edge

EDGE_REGISTER_INTERNAL(performance, edge::performance::Init);
