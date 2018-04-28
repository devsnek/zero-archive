#include <v8.h>
#include "ivan.h"

namespace ivan {
namespace util {

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::Local;
using v8::Function;
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

static void RunMicrotasks(const FunctionCallbackInfo<Value>& info) {
  info.GetIsolate()->RunMicrotasks();
}

static void EnqueueMicrotask(const FunctionCallbackInfo<Value>& info) {
  CHECK(info[0]->IsFunction());
  info.GetIsolate()->EnqueueMicrotask(info[0].As<Function>());
}

static void SetPromiseRejectionHandler(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  promise_reject_handler.Set(isolate, args[0].As<Function>());

  isolate->SetPromiseRejectCallback([](v8::PromiseRejectMessage message) {
    Local<Promise> promise = message.GetPromise();
    Isolate* isolate = promise->GetIsolate();
    v8::PromiseRejectEvent event = message.GetEvent();
    Local<Context> context = isolate->GetCurrentContext();

    Local<Value> value = message.GetValue();
    if (value.IsEmpty())
      value = v8::Undefined(isolate);

    Local<Boolean> handled = Boolean::New(isolate, event == v8::kPromiseHandlerAddedAfterReject);
    Local<Value> args[] = { promise, value, handled };

    USE(promise_reject_handler.Get(isolate)->Call(context, v8::Undefined(isolate), 3, args));
  });
}

static void SetNextTickHandler(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  next_tick_handler.Set(isolate, args[0].As<Function>());
}

static void SafeToString(const FunctionCallbackInfo<Value>& args) {
  auto context = args.GetIsolate()->GetCurrentContext();
  args.GetReturnValue().Set(args[0]->ToDetailString(context).ToLocalChecked());
}

static void Init(Local<Context> context, Local<Object> target) {
  IVAN_SET_PROPERTY(context, target, "getPromiseDetails", GetPromiseDetails);
  IVAN_SET_PROPERTY(context, target, "isPromise", IsPromise);
  IVAN_SET_PROPERTY(context, target, "runMicrotasks", RunMicrotasks);
  IVAN_SET_PROPERTY(context, target, "enqueueMicrotask", EnqueueMicrotask);
  IVAN_SET_PROPERTY(context, target, "setPromiseRejectionHandler", SetPromiseRejectionHandler);
  IVAN_SET_PROPERTY(context, target, "setNextTickHandler", SetNextTickHandler);
  IVAN_SET_PROPERTY(context, target, "safeToString", SafeToString);

#define V(name) \
  IVAN_SET_PROPERTY(context, target, #name, Promise::PromiseState::name);
  V(kPending);
  V(kFulfilled);
  V(kRejected);
#undef V
}

}  // namespace util
}  // namespace ivan

IVAN_REGISTER_INTERNAL(util, ivan::util::Init);
