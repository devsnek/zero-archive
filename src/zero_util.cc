#include "v8.h"
#include "zero.h"

using v8::Array;
using v8::Boolean;
using v8::Context;
using v8::Local;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Number;
using v8::Object;
using v8::Integer;
using v8::Isolate;
using v8::String;
using v8::Value;
using v8::Persistent;
using v8::Promise;
using v8::Proxy;
using v8::Value;
using v8::V8;

namespace zero {
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
    ZERO_SET_PROPERTY(context, obj, "sourceLine", source_line);

  ZERO_SET_PROPERTY(context, obj, "resourceName",
      msg->GetScriptResourceName()->ToString());

  if (msg->GetLineNumber(context).To(&line_number))
    ZERO_SET_PROPERTY(context, obj, "lineNumber", line_number);

  if (msg->GetStartColumn(context).To(&start_column))
    ZERO_SET_PROPERTY(context, obj, "startColumn", start_column);

  if (msg->GetEndColumn(context).To(&end_column))
    ZERO_SET_PROPERTY(context, obj, "endColumn", end_column);

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

static void GetEnv(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  if (!args[0]->IsSymbol()) {
    String::Utf8Value key(isolate, args[0]);
    const char* val = getenv(*key);
    if (val) {
      return args.GetReturnValue().Set(ZERO_STRING(isolate, val));
    }
  }
}

static void SetEnv(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  String::Utf8Value key(isolate, args[0]);
  String::Utf8Value val(isolate, args[1]);
  setenv(*key, *val, 1);
}

static void UnsetEnv(const FunctionCallbackInfo<Value>& args) {
  if (args[0]->IsString()) {
    String::Utf8Value key(args.GetIsolate(), args[0]);
    unsetenv(*key);
  }
}

class WeakRef {
 public:
  WeakRef(Isolate* isolate,
           Local<Object> object,
           Local<Function> callback)
    : isolate_(isolate) {
    persistent_.Reset(isolate_, object);
    callback_.Reset(isolate_, callback);

    persistent_.SetWeak(this, Callback, v8::WeakCallbackType::kParameter);
  }

  ~WeakRef() {
    persistent_.Reset();
    callback_.Reset();
  }

  inline Local<Function> callback() {
    return callback_.Get(isolate_);
  }

  static void New(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Object> object = args[0].As<Object>();
    Local<Function> callback = args[1].As<Function>();

    new WeakRef(isolate, object, callback);
  }

 private:
  static void Callback(const v8::WeakCallbackInfo<WeakRef>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    auto data = reinterpret_cast<WeakRef*>(args.GetParameter());

    data->callback()->Call(
        context, v8::Undefined(isolate), 0, nullptr).ToLocalChecked();

    delete data;
  }

  Isolate* isolate_;
  Persistent<Object> persistent_;
  Persistent<Function> callback_;
};

static void Init(Local<Context> context, Local<Object> target) {
  ZERO_SET_PROPERTY(context, target, "getPromiseDetails", GetPromiseDetails);
  ZERO_SET_PROPERTY(context, target, "getProxyDetails", GetProxyDetails);
  ZERO_SET_PROPERTY(context, target, "runMicrotasks", RunMicrotasks);
  ZERO_SET_PROPERTY(context, target, "enqueueMicrotask", EnqueueMicrotask);
  ZERO_SET_PROPERTY(context, target, "safeToString", SafeToString);
  ZERO_SET_PROPERTY(context, target, "setV8Flags", SetV8Flags);
  ZERO_SET_PROPERTY(context, target, "createMessage", CreateMessage);
  ZERO_SET_PROPERTY(context, target, "previewEntries", PreviewEntries);
  ZERO_SET_PROPERTY(context, target, "getEnv", GetEnv);
  ZERO_SET_PROPERTY(context, target, "setEnv", SetEnv);
  ZERO_SET_PROPERTY(context, target, "unsetEnv", UnsetEnv);
  ZERO_SET_PROPERTY(context, target, "WeakRef", WeakRef::New);

#define V(name) \
  ZERO_SET_PROPERTY(context, target, #name, Promise::PromiseState::name);
  V(kPending);
  V(kFulfilled);
  V(kRejected);
#undef V
}

}  // namespace util
}  // namespace zero

ZERO_REGISTER_INTERNAL(util, zero::util::Init);
