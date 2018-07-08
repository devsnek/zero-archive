#include <uv.h>

#include "v8.h"
#include "zero.h"
#include "base_object-inl.h"

namespace zero {
namespace tty {

using v8::ArrayBuffer;
using v8::ArrayBufferView;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::IntegrityLevel;
using v8::Isolate;
using v8::Local;
using v8::MaybeLocal;
using v8::Object;
using v8::Persistent;
using v8::Promise;
using v8::String;
using v8::TryCatch;
using v8::Value;

static void alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
  *buf = uv_buf_init(Malloc(suggested_size), suggested_size);
}

struct tty_write_req {
  Isolate* isolate;
  Persistent<Promise::Resolver> resolver;
};

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
      uv_tty_set_mode(&handle_, UV_TTY_MODE_RAW);
    }
    ZERO_SET_PROPERTY(isolate->GetCurrentContext(), obj, "isTTY", uv_guess_handle(fd) == UV_TTY);
  }

  ~TTYWrap() {
    read_cb_.Reset();
    End();
  }

  static void New(const FunctionCallbackInfo<Value>& args) {
    CHECK(args.IsConstructCall());

    Isolate* isolate = args.GetIsolate();
    Local<Object> that = args.This();

    new TTYWrap(isolate, that, args[0]->Int32Value(), args[1]);

    args.GetReturnValue().Set(that);
  }

  void End() {
    uv_read_stop(reinterpret_cast<uv_stream_t*>(&handle_));
    uv_shutdown_t req;
    uv_shutdown(&req, reinterpret_cast<uv_stream_t*>(&handle_), nullptr);
  }

  static void ReadCallback(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
    TTYWrap* obj = reinterpret_cast<TTYWrap*>(stream->data);
    Isolate* isolate = obj->isolate();
    InternalCallbackScope callback_scope(isolate);
    Local<Context> context = isolate->GetCurrentContext();

    Local<Value> args[] = {
      String::NewFromUtf8(isolate, buf->base, String::NewStringType::kNormalString, nread),
    };
    Local<Function> cb = obj->read_cb_.Get(isolate);
    USE(cb->Call(context, obj->object(), 1, args));
  }

  static void Write(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    TTYWrap* obj;
    ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

    CHECK(args[0]->IsArrayBufferView());

    Local<ArrayBufferView> ui = args[0].As<ArrayBufferView>();
    ArrayBuffer::Contents ab_c = ui->Buffer()->GetContents();
    char* data = static_cast<char*>(ab_c.Data()) + ui->ByteOffset();

    uv_buf_t buf[] = {
      {
        .base = data,
        .len = static_cast<size_t>(ab_c.ByteLength()),
      },
    };

    Local<Promise::Resolver> promise = Promise::Resolver::New(context).ToLocalChecked();

    auto req = new uv_write_t;
    auto tty_req = new tty_write_req{isolate};
    tty_req->resolver.Reset(isolate, promise);
    req->data = tty_req;
    uv_write(req, reinterpret_cast<uv_stream_t*>(&obj->handle_), buf, 1, [](uv_write_t* req, int) {
      auto data = reinterpret_cast<tty_write_req*>(req->data);
      InternalCallbackScope callback_scope(data->isolate);
      data->resolver.Get(data->isolate)->Resolve(v8::Undefined(data->isolate));
      delete data;
      delete req;
    });

    args.GetReturnValue().Set(promise->GetPromise());
  }

  static void SetBlocking(const FunctionCallbackInfo<Value>& args) {
    TTYWrap* obj;
    ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

    uv_stream_set_blocking(
        reinterpret_cast<uv_stream_t*>(&obj->handle_),
        args[0]->IsTrue());
  }

  static void End(const FunctionCallbackInfo<Value>& args) {
    TTYWrap* obj;
    ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
    obj->End();
  }

 private:
  uv_tty_t handle_;
  v8::Persistent<Function> read_cb_;
};

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = BaseObject::MakeJSTemplate(isolate, "TTYWrap", TTYWrap::New);

  ZERO_SET_PROTO_PROP(context, tpl, "write", TTYWrap::Write);
  ZERO_SET_PROTO_PROP(context, tpl, "end", TTYWrap::End);
  ZERO_SET_PROTO_PROP(context, tpl, "setBlocking", TTYWrap::SetBlocking);

  target->Set(ZERO_STRING(isolate, "TTYWrap"), tpl->GetFunction());
}

}  // namespace tty
}  // namespace zero

ZERO_REGISTER_INTERNAL(tty, zero::tty::Init);
