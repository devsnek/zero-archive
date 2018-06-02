#include "v8.h"
#include "ivan.h"

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::Local;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Object;
using v8::Integer;
using v8::Isolate;
using v8::String;
using v8::Value;
using v8::Promise;
using v8::Proxy;
using v8::Value;
using v8::V8;

namespace ivan {
namespace util {

static void GetPromiseDetails(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  if (!info[0]->IsPromise())
    return;

  Local<Promise> promise = info[0].As<Promise>();
  Local<Array> ret = Array::New(isolate, 2);

  int state = promise->State();
  ret->Set(0, Integer::New(isolate, state));
  if (state != Promise::PromiseState::kPending)
    ret->Set(1, promise->Result());

  info.GetReturnValue().Set(ret);
}

static void GetProxyDetails(const FunctionCallbackInfo<Value>& info) {
  if (!info[0]->IsProxy()) {
    return;
  }

  Isolate* isolate = info.GetIsolate();
  Local<Array> ret = Array::New(isolate, 2);
  Local<Proxy> p = info[0].As<Proxy>();
  ret->Set(0, p->GetTarget());
  ret->Set(1, p->GetHandler());
  info.GetReturnValue().Set(ret);
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

static void SafeToString(const FunctionCallbackInfo<Value>& args) {
  auto context = args.GetIsolate()->GetCurrentContext();
  args.GetReturnValue().Set(args[0]->ToDetailString(context).ToLocalChecked());
}

static void SetV8Flags(const FunctionCallbackInfo<Value>& args) {
  String::Utf8Value flags(args.GetIsolate(), args[0]);
  V8::SetFlagsFromString(*flags, flags.length());
}

static void CreateMessage(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<v8::Message> msg = v8::Exception::CreateMessage(isolate, args[0]);
  Local<Object> obj = Object::New(isolate);

  Local<String> source_line;
  Local<String> resource_name;
  int line_number;
  int start_column;
  int end_column;

  if (msg->GetSourceLine(context).ToLocal(&source_line))
    IVAN_SET_PROPERTY(context, obj, "sourceLine", source_line);

  IVAN_SET_PROPERTY(context, obj, "resourceName",
      msg->GetScriptResourceName()->ToString());

  if (msg->GetLineNumber(context).To(&line_number))
    IVAN_SET_PROPERTY(context, obj, "lineNumber", line_number);

  if (msg->GetStartColumn(context).To(&start_column))
    IVAN_SET_PROPERTY(context, obj, "startColumn", start_column);

  if (msg->GetEndColumn(context).To(&end_column))
    IVAN_SET_PROPERTY(context, obj, "endColumn", end_column);

  args.GetReturnValue().Set(obj);
}

static void PreviewEntries(const FunctionCallbackInfo<Value>& args) {
  if (!args[0]->IsObject())
    return;

  bool is_keyed;
  Local<Value> entries;
  if (!args[0].As<Object>()->PreviewEntries(&is_keyed).ToLocal(&entries))
    return;

  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  Local<Array> ret = Array::New(isolate, 2);
  ret->Set(context, 0, entries).FromJust();
  ret->Set(context, 1, Boolean::New(isolate, is_keyed)).FromJust();

  args.GetReturnValue().Set(ret);
}

static void Init(Local<Context> context, Local<Object> target) {
  IVAN_SET_PROPERTY(context, target, "getPromiseDetails", GetPromiseDetails);
  IVAN_SET_PROPERTY(context, target, "getProxyDetails", GetProxyDetails);
  IVAN_SET_PROPERTY(context, target, "runMicrotasks", RunMicrotasks);
  IVAN_SET_PROPERTY(context, target, "enqueueMicrotask", EnqueueMicrotask);
  IVAN_SET_PROPERTY(context, target, "setPromiseRejectionHandler", SetPromiseRejectionHandler);
  IVAN_SET_PROPERTY(context, target, "safeToString", SafeToString);
  IVAN_SET_PROPERTY(context, target, "setV8Flags", SetV8Flags);
  IVAN_SET_PROPERTY(context, target, "createMessage", CreateMessage);
  IVAN_SET_PROPERTY(context, target, "previewEntries", PreviewEntries);

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
