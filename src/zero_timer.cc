#include "uv.h"
#include "v8.h"
#include "zero.h"
#include "base_object-inl.h"

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

namespace zero {
namespace timer {

class TimerWrap : public BaseObject {
 public:
  TimerWrap(Isolate* isolate, Local<Object> object, Local<Function> cb)
    : BaseObject(isolate, object) {
      int r = uv_timer_init(uv_default_loop(), &handle_);
      CHECK_EQ(r, 0);

      handle_.data = this;
      uv_ref(reinterpret_cast<uv_handle_t*>(&handle_));

      callback_.Reset(isolate, cb);
    }

  static void New(const FunctionCallbackInfo<Value>& args) {
    CHECK(args.IsConstructCall());
    new TimerWrap(args.GetIsolate(), args.This(), args[0].As<Function>());
  }

  static void Update(const FunctionCallbackInfo<Value>& args) {
    TimerWrap* wrap;
    ASSIGN_OR_RETURN_UNWRAP(&wrap, args.This());

    int64_t timeout = args[0]->IntegerValue();

    int err = uv_timer_start(&wrap->handle_, [](uv_timer_t* timer) {
      auto wrap = static_cast<TimerWrap*>(timer->data);
      Isolate* isolate = wrap->isolate();
      InternalCallbackScope callback_scope(isolate);
      v8::HandleScope handle_scope(isolate);
      Local<Context> context = isolate->GetCurrentContext();

      Local<Function> cb = wrap->callback_.Get(isolate);

      USE(cb->Call(context, v8::Null(isolate), 0, {}));
    }, timeout, 0);

    args.GetReturnValue().Set(err);
  }

 private:
  v8::Persistent<Function> callback_;
  uv_timer_t handle_;
};

static void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = BaseObject::MakeJSTemplate(isolate, "TimerWrap", TimerWrap::New);

  ZERO_SET_PROTO_PROP(context, tpl, "update", TimerWrap::Update);

  ZERO_SET_PROPERTY(context, target, "TimerWrap", tpl->GetFunction());
}

}  // namespace timer
}  // namespace zero

ZERO_REGISTER_INTERNAL(timer_wrap, zero::timer::Init);
