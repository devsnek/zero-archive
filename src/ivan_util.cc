#include <v8.h>
#include "ivan.h"

namespace ivan {
namespace util {

using v8::Array;
using v8::Local;
using v8::FunctionCallbackInfo;
using v8::Object;
using v8::Integer;
using v8::Isolate;
using v8::Value;
using v8::Promise;
using v8::Value;

static void GetPromiseDetails(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  Local<Array> ret = Array::New(isolate, 2);
  info.GetReturnValue().Set(ret);

  if (!info[0]->IsPromise())
    return;

  Local<Promise> promise = info[0].As<Promise>();

  int state = promise->State();
  ret->Set(0, Integer::New(isolate, state));
  if (state != Promise::PromiseState::kPending)
    ret->Set(1, promise->Result());
}

static void IsPromise(const FunctionCallbackInfo<Value>& info) {
  info.GetReturnValue().Set(info[0]->IsPromise());
}

static void Init(Isolate* isolate, Local<Object> target) {
  IVAN_SET_METHOD(isolate, target, "getPromiseDetails", GetPromiseDetails);
  IVAN_SET_METHOD(isolate, target, "isPromise", IsPromise);

#define V(name) \
  USE(target->Set(isolate->GetCurrentContext(),                                \
              IVAN_STRING(isolate, #name),                                     \
              Integer::New(isolate, Promise::PromiseState::name)))
  V(kPending);
  V(kFulfilled);
  V(kRejected);
#undef V
}

}  // namespace util
}  // namespace ivan

IVAN_REGISTER_INTERNAL(util, ivan::util::Init);
