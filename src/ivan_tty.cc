#include <uv.h>

#include "v8.h"
#include "ivan.h"
#include "base_object-inl.h"

namespace ivan {
namespace tty {

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::IntegrityLevel;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;

static void alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  *buf = uv_buf_init(Malloc(suggested_size), suggested_size);
}

class TTYWrap : public BaseObject {
 public:
  TTYWrap(Isolate* isolate,
          Local<Object> obj,
          int fd,
          Local<Value> read_cb) : BaseObject(isolate, obj) {
    bool readable = fd == 0;
    handle_.data = this;
    uv_tty_init(uv_default_loop(), &handle_, fd, readable);
    if (readable && !read_cb.IsEmpty()) {
      read_cb_.Reset(isolate, read_cb.As<Function>());
      uv_read_start(reinterpret_cast<uv_stream_t*>(&handle_), alloc_cb, ReadCallback);
    }
  }

  ~TTYWrap() {
    read_cb_.Reset();
    uv_read_stop(reinterpret_cast<uv_stream_t*>(&handle_));
    uv_shutdown_t req;
    uv_shutdown(&req, reinterpret_cast<uv_stream_t*>(&handle_), nullptr);
  }

  static void ReadCallback(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
    TTYWrap* obj = reinterpret_cast<TTYWrap*>(stream->data);
    Isolate* isolate = Isolate::GetCurrent();
    Local<Value> args[] = {
      String::NewFromUtf8(isolate, buf->base, String::NewStringType::kNormalString, buf->len),
    };
    obj->read_cb_.Get(isolate)->Call(v8::Undefined(isolate), 1, args);
  }

  static void New(const FunctionCallbackInfo<Value>& args) {
    CHECK(args.IsConstructCall());

    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    Local<Object> that = args.This();

    TTYWrap* obj = new TTYWrap(isolate, that, args[0]->Int32Value(), args[1]);

    Wrap(that, obj);

    that->SetIntegrityLevel(context, IntegrityLevel::kFrozen);
    args.GetReturnValue().Set(that);
  }

  static void Write(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    TTYWrap* obj;
    ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

    String::Utf8Value utf8(isolate, args[0]);
    const char* data = *utf8;

    uv_buf_t buf[] = {
      { .base = (char*) data, .len = strlen(data) },
    };

    uv_write_t req;
    uv_write(&req, reinterpret_cast<uv_stream_t*>(&obj->handle_), buf, 1, [](uv_write_t*, int) {});
  }

 private:
  uv_tty_t handle_;
  v8::Persistent<Function> read_cb_;
};

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, TTYWrap::New);
  tpl->SetClassName(IVAN_STRING(isolate, "TTYWrap"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  IVAN_SET_PROTO_METHOD(context, tpl, "write", TTYWrap::Write);

  target->Set(IVAN_STRING(isolate, "TTYWrap"), tpl->GetFunction());
}

}  // namespace tty
}  // namespace ivan

IVAN_REGISTER_INTERNAL(tty, ivan::tty::Init);
