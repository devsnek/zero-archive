#include <uv.h>
#include <string>

#include "v8.h"
#include "edge.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::External;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Persistent;
using v8::String;
using v8::Value;

namespace edge {
namespace tcp {

typedef struct {
  uv_tcp_t handle;
  uv_shutdown_t shutdown;
  uv_connect_t connect;
  uv_buf_t reading;
  Isolate* isolate;
  Persistent<Object> that;
  Persistent<Function> on_connection;
  Persistent<Function> on_connect;
  Persistent<Function> on_write;
  Persistent<Function> on_read;
  Persistent<Function> on_finish;
  Persistent<Function> on_close;
} edge_tcp_t;

#define HANDLE_UV(isolate, op) do {                                           \
  int ret = (op);                                                             \
  if (ret < 0) {                                                              \
    EDGE_THROW_EXCEPTION((isolate), uv_err_name(ret));                        \
    return;                                                                   \
  }                                                                           \
} while (0)

static void Init(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  edge_tcp_t* that = new edge_tcp_t;

  that->isolate = isolate;
  that->that.Reset(isolate, args[0].As<Object>());
  that->handle.data = that;

  uv_tcp_init(uv_default_loop(), &that->handle);

  args.GetReturnValue().Set(External::New(isolate, that));
}

static void on_uv_connection(uv_stream_t* handle, int) {
  auto that = reinterpret_cast<edge_tcp_t*>(handle->data);
  Isolate* isolate = that->isolate;
  Local<Context> context = isolate->GetCurrentContext();

  edge_tcp_t* client = new edge_tcp_t;
  uv_accept(handle, reinterpret_cast<uv_stream_t*>(&client->handle));

  Local<Function> fn = that->on_connection.Get(isolate);
  Local<Value> val;

  Local<Value> args[] = { External::New(isolate, client) };
  USE(fn->Call(context, v8::Undefined(isolate), 1, args));
}

static void Listen(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  auto that = reinterpret_cast<edge_tcp_t*>(args[0].As<External>()->Value());

  int port = args[1]->Int32Value();
  String::Utf8Value ip(isolate, args[2]);
  Local<Function> cb = args[3].As<Function>();

  that->on_connection.Reset(isolate, cb);

  struct sockaddr_in addr;
  HANDLE_UV(isolate, uv_ip4_addr(*ip, port, &addr));

  HANDLE_UV(isolate,
      uv_tcp_bind(&that->handle, reinterpret_cast<const struct sockaddr*>(&addr), 0));

  HANDLE_UV(isolate,
      uv_listen(reinterpret_cast<uv_stream_t*>(&that->handle), 511, on_uv_connection));
}

static void on_uv_connect(uv_connect_t* req, int status) {
  auto that = reinterpret_cast<edge_tcp_t*>(req->handle->data);
  Isolate* isolate = that->isolate;
  Local<Context> context = isolate->GetCurrentContext();

  Local<Function> cb = that->on_connect.Get(isolate);

  Local<Value> args[] = { v8::Int32::New(isolate, status) };
  USE(cb->Call(context, v8::Undefined(isolate), 1, args));

  that->on_connect.Reset();
}

static void Connect(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  auto that = reinterpret_cast<edge_tcp_t*>(args[0].As<External>()->Value());

  int port = args[1]->Int32Value();
  String::Utf8Value ip(isolate, args[2]);
  Local<Function> cb = args[3].As<Function>();

  that->on_connect.Reset(isolate, cb);

  struct sockaddr_in addr;
  HANDLE_UV(isolate, uv_ip4_addr(*ip, port, &addr));

  HANDLE_UV(isolate, uv_tcp_connect(
        &that->connect,
        &that->handle,
        reinterpret_cast<const struct sockaddr*>(&addr),
        on_uv_connect));
}

void Init(Local<Context> context, Local<Object> target) {
  EDGE_SET_PROPERTY(context, target, "init", Init);
  EDGE_SET_PROPERTY(context, target, "listen", Listen);
  EDGE_SET_PROPERTY(context, target, "connect", Connect);
}

}  // namespace tcp
}  // namespace edge

EDGE_REGISTER_INTERNAL(tcp, edge::tcp::Init);
