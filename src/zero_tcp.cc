#include <uv.h>
#include <string>

#include "v8.h"
#include "zero.h"
#include "base_object-inl.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::External;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Persistent;
using v8::String;
using v8::Value;

namespace zero {
namespace tcp_wrap {

#define HANDLE_UV(isolate, op) do {                                           \
  int ret = (op);                                                             \
  if (ret < 0) {                                                              \
    ZERO_THROW_EXCEPTION((isolate), uv_err_name(ret));                        \
    return;                                                                   \
  }                                                                           \
} while (0)

static Persistent<Function> constructor;

class TCPWrap : BaseObject {
 public:
  TCPWrap(Isolate* isolate,
          Local<Object> obj) : BaseObject(isolate, obj) {
    handle_.data = this;
  }

  ~TCPWrap() {
    // uv_close(&handle_, []() {});
  }

  static void New(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Object> that = args.This();

    new TCPWrap(isolate, that);

    args.GetReturnValue().Set(that);
  }

  static void Listen(const FunctionCallbackInfo<Value>& args) {
    TCPWrap* that;
    ASSIGN_OR_RETURN_UNWRAP(&that, args.This());
    Isolate* isolate = args.GetIsolate();

    int port = args[0]->Int32Value();
    String::Utf8Value ip(isolate, args[1]);

    struct sockaddr_in addr;
    HANDLE_UV(isolate, uv_ip4_addr(*ip, port, &addr));

    HANDLE_UV(isolate,
        uv_tcp_bind(&that->handle_, reinterpret_cast<const struct sockaddr*>(&addr), 0));

    HANDLE_UV(isolate,
        uv_listen(reinterpret_cast<uv_stream_t*>(&that->handle_), 511, on_uv_connection));
  }

  static void Connect(const FunctionCallbackInfo<Value>& args) {
    TCPWrap* that;
    ASSIGN_OR_RETURN_UNWRAP(&that, args.This());
    Isolate* isolate = args.GetIsolate();

    int port = args[0]->Int32Value();
    String::Utf8Value ip(isolate, args[1]);

    struct sockaddr_in addr;
    HANDLE_UV(isolate, uv_ip4_addr(*ip, port, &addr));

    HANDLE_UV(isolate, uv_tcp_connect(
          &that->connect_,
          &that->handle_,
          reinterpret_cast<const struct sockaddr*>(&addr),
          on_uv_connect));
  }

 private:
  static void on_uv_connection(uv_stream_t* handle, int) {
    auto that = reinterpret_cast<TCPWrap*>(handle->data);
    Isolate* isolate = that->isolate();
    Local<Context> context = isolate->GetCurrentContext();

    auto client_obj = constructor.Get(isolate)->NewInstance(context).ToLocalChecked();
    TCPWrap* client;
    ASSIGN_OR_RETURN_UNWRAP(&client, client_obj);
    uv_accept(handle, reinterpret_cast<uv_stream_t*>(&client->handle_));

    // Local<Function> fn = that->on_connection.Get(isolate);
    // Local<Value> val;

    // Local<Value> args[] = { External::New(isolate, client) };
    // USE(fn->Call(context, v8::Undefined(isolate), 1, args));
  }

  static void on_uv_connect(uv_connect_t* req, int status) {
    // auto that = reinterpret_cast<TCPWrap*>(req->handle->data);
    // Isolate* isolate = that->isolate();
    // Local<Context> context = isolate->GetCurrentContext();

    // Local<Function> cb = that->on_connect.Get(isolate);

    // Local<Value> args[] = { v8::Int32::New(isolate, status) };
    // USE(cb->Call(context, v8::Undefined(isolate), 1, args));

    // that->on_connect.Reset();
  }

  uv_tcp_t handle_;
  // uv_shutdown_t shutdown_;
  uv_connect_t connect_;
  // uv_buf_t reading_;
  Persistent<Function> on_connection_;
  Persistent<Function> on_connect_;
  Persistent<Function> on_write_;
  Persistent<Function> on_read_;
  Persistent<Function> on_finish_;
  Persistent<Function> on_close_;
};

void Init(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = BaseObject::MakeJSTemplate(isolate, "TCPWrap", TCPWrap::New);

  ZERO_SET_PROTO_PROP(context, tpl, "connect", TCPWrap::Connect);
  ZERO_SET_PROTO_PROP(context, tpl, "listen", TCPWrap::Listen);

  constructor.Reset(isolate, tpl->GetFunction());
  target->Set(ZERO_STRING(isolate, "TCPWrap"), tpl->GetFunction());
}

}  // namespace tcp_wrap
}  // namespace zero

ZERO_REGISTER_INTERNAL(tcp_wrap, zero::tcp_wrap::Init);
