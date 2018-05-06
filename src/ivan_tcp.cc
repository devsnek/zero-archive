#include <string>
#include <uv.h>

#include "v8.h"
#include "ivan.h"

using v8::ArrayBuffer;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Persistent;
using v8::String;
using v8::Value;

namespace ivan {
namespace tcp {

typedef struct {
  uv_tcp_t handle;
  uv_shutdown_t shutdown;
  uv_connect_t connect;
  uv_buf_t reading;
  Isolate* isolate;
  Persistent<Object> that;
  Persistent<Function> alloc_connection;
  Persistent<Function> on_connect;
  Persistent<Function> on_write;
  Persistent<Function> on_read;
  Persistent<Function> on_finish;
  Persistent<Function> on_close;
} ivan_tcp_t;

#define UNWRAP_OR_RETURN_BUFFER(isolate, buf, val) do {                       \
  (buf) = reinterpret_cast<ivan_tcp_t*>((val).As<ArrayBuffer>()->GetContents().Data()); \
  if ((buf) == nullptr) {                                                     \
    IVAN_THROW_EXCEPTION(isolate, "UNWRAP_OR_RETURN_BUFFER");                 \
    return;                                                                   \
  }                                                                           \
} while (0)

#define HANDLE_UV(isolate, op) do {                                           \
  int ret = (op);                                                             \
  if (ret < 0) {                                                              \
    IVAN_THROW_EXCEPTION((isolate), uv_err_name(ret));                        \
    return;                                                                   \
  }                                                                           \
} while (0)

static void Init(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ivan_tcp_t* that;
  UNWRAP_OR_RETURN_BUFFER(isolate, that, args[0]);

  that->isolate = isolate;
  that->that.Reset(isolate, args[1].As<Object>());
  that->handle.data = that;

  uv_tcp_init(uv_default_loop(), &that->handle);

#define V(i, name) \
  if (args[i]->IsFunction()) that->name.Reset(isolate, args[i].As<Function>());
  V(2, alloc_connection);
  V(3, on_connect);
  V(4, on_write);
  V(5, on_read);
  V(6, on_finish);
  V(7, on_close);
#undef V
}

static void Listen(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ivan_tcp_t* that;
  UNWRAP_OR_RETURN_BUFFER(isolate, that, args[0]);

  int port = args[1]->Int32Value();
  String::Utf8Value ip(isolate, args[2]);

  struct sockaddr_in addr;
  HANDLE_UV(isolate, uv_ip4_addr(*ip, port, &addr));

  HANDLE_UV(isolate, uv_tcp_bind(&that->handle, reinterpret_cast<const struct sockaddr*>(&addr), 0));

  HANDLE_UV(isolate,
      uv_listen(reinterpret_cast<uv_stream_t*>(&that->handle), 511, [](uv_stream_t* server, int) {
        auto that = reinterpret_cast<ivan_tcp_t*>(server->data);
        Isolate* isolate = that->isolate;
        Local<Context> context = isolate->GetCurrentContext();

        Local<Function> fn = that->alloc_connection.Get(that->isolate);
        Local<Value> val;
        if (fn->Call(context, v8::Undefined(isolate), 0, {}).ToLocal(&val)) {
          ivan_tcp_t* client;
          UNWRAP_OR_RETURN_BUFFER(isolate, client, val);

          uv_accept(server, reinterpret_cast<uv_stream_t*>(&client->handle));
          Local<Function> cb = that->on_connect.Get(isolate);
          Local<Value> args[] = { client->that.Get(client->isolate) };
          USE(cb->Call(context, v8::Undefined(isolate), 1, args));
        }
      }));
}

void Init(Local<Context> context, Local<Object> target) {
  IVAN_SET_PROPERTY(context, target, "init", Init);
  IVAN_SET_PROPERTY(context, target, "listen", Listen);
  IVAN_SET_PROPERTY(context, target, "sizeof_ivan_tcp_t", sizeof(ivan_tcp_t));
}

}  // namespace tcp
}  // namespace ivan

IVAN_REGISTER_INTERNAL(tcp, ivan::tcp::Init);
