#include <ffi/ffi.h>
#include <v8.h>
#include "ivan.h"
#include "base_object-inl.h"

using v8::ArrayBuffer;
using v8::ArrayBufferView;
using v8::Context;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

namespace ivan {
namespace ffi {

class FFIWrap : public BaseObject {
 public:
  FFIWrap(Isolate* isolate,
          Local<Object> object) : BaseObject(isolate, object) {}
  ~FFIWrap() {}

  static void New(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    CHECK(args.IsConstructCall());
    Local<Object> that = args.This();

    FFIWrap* obj = new FFIWrap(isolate, that);

    Wrap(that, obj);

    that->SetIntegrityLevel(context, v8::IntegrityLevel::kFrozen);
    args.GetReturnValue().Set(that);
  }

 private:
  ffi_cif cif_;
};

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, FFIWrap::New);
  tpl->SetClassName(IVAN_STRING(isolate, "FFIWrap"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  IVAN_SET_PROPERTY(context, target, "FFIWrap", tpl);

#define V(name, type) \
  IVAN_SET_PROPERTY(context, target, name, sizeof(type));
  V("FFI_CIF_SIZE", ffi_cif);
  V("FFI_ARG_SIZE", ffi_arg);
  V("FFI_TYPE_SIZE", ffi_type);
#undef V
}

}  // namespace ffi
}  // namespace ivan

IVAN_REGISTER_INTERNAL(ffi_wrap, ivan::ffi::Init);
