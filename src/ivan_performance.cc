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

static void Hrtime(const FunctionCallbackInfo<Value>& args) {
  uint64_t t = uv_hrtime() - timeOrigin;

  Local<ArrayBuffer> ab = args[0].As<Uint32Array>()->Buffer();
  uint32_t* fields = static_cast<uint32_t*>(ab->GetContents().Data());

  uint32_t NANOS_PER_SEC = 1000000000;
  fields[0] = (t / NANOS_PER_SEC) >> 32;
  fields[1] = (t / NANOS_PER_SEC) & 0xffffffff;
  fields[2] = t % NANOS_PER_SEC;
}

void Init(Local<Context> context, Local<Object> target) {
  timeOrigin = uv_hrtime();

  IVAN_SET_PROPERTY(context, target, "hrtime", Hrtime);
}

}  // namespace performance
}  // namespace ivan

IVAN_REGISTER_INTERNAL(performance, ivan::performance::Init);
