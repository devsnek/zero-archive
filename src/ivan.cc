#include <uv.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h> // PATH_MAX
#include <iterator>  // std::size

#include "v8.h"
#include "ivan.h"
#include "ivan_script_wrap.h"
#include "ivan_blobs.h"
#include "ivan_errors.h"
#include "ivan_platform.h"

using v8::Array;
using v8::ArrayBuffer;
using v8::Boolean;
using v8::Context;
using v8::HandleScope;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Local;
using v8::MaybeLocal;
using v8::Isolate;
using v8::Object;
using v8::String;
using v8::Value;
using v8::V8;
using v8::Platform;
using v8::Promise;
using v8::TryCatch;

#define IVAN_INTERNAL_MODULES(V) \
  V(encoding);                   \
  V(util);                       \
  V(module_wrap);                \
  V(script_wrap);                \
  V(fs);                         \
  V(tty);                        \
  V(debug);                      \
  V(performance);                \
  V(tcp);                        \
  V(inspector_sync);             \
  V(types);                      \
  V(timer_wrap);                 \


#define V(name) void _ivan_register_##name()
IVAN_INTERNAL_MODULES(V)
#undef V

namespace ivan {

static ivan_module* modlist;

void ivan_module_register(void* m) {
  struct ivan_module* mp = reinterpret_cast<struct ivan_module*>(m);

  mp->im_link = modlist;
  modlist = mp;
}

inline struct ivan_module* get_module(const char* name) {
  struct ivan_module* mp;

  for (mp = modlist; mp != nullptr; mp = mp->im_link) {
    if (strcmp(mp->im_name, name) == 0)
      break;
  }

  return mp;
}

namespace js_debug {

static void DebugLog(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  String::Utf8Value utf8(isolate, info[0].As<String>());
  bool prefix = info[1]->IsTrue();

  fprintf(stdout, "%s%s", prefix ? "[IVAN] " : "", *utf8);
  fflush(stdout);
}

static void DebugError(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  String::Utf8Value utf8(isolate, info[0].As<String>());
  bool prefix = info[1]->IsTrue();

  fprintf(stderr, "%s%s", prefix ? "[IVAN] " : "", *utf8);
  fflush(stderr);
}

static void Init(Local<Context> context, Local<Object> exports) {
  IVAN_SET_PROPERTY(context, exports, "log", DebugLog);
  IVAN_SET_PROPERTY(context, exports, "error", DebugError);
}

}  // namespace js_debug
}  // namespace ivan

IVAN_REGISTER_INTERNAL(debug, ivan::js_debug::Init);

static void Bindings(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<Context> context = isolate->GetCurrentContext();

  Local<String> req = info[0].As<String>();

  Local<Object> cache =
      context->GetEmbedderData(ivan::EmbedderKeys::kBindingCache).As<Object>();
  if (cache->HasOwnProperty(context, req).FromMaybe(false)) {
    info.GetReturnValue().Set(cache->Get(context, req).ToLocalChecked());
    return;
  }

  String::Utf8Value request(isolate, req);

  Local<Object> exports = Object::New(isolate);

  if (strcmp(*request, "natives") == 0) {
    ivan::blobs::DefineJavaScript(isolate, exports);
  } else {
    ivan::ivan_module* mod = ivan::get_module(*request);
    if (mod != nullptr) {
      mod->im_function(context, exports);
    } else {
      IVAN_THROW_EXCEPTION(isolate, "unknown binding");
      return;
    }
  }

  USE(cache->Set(context, req, exports));
  info.GetReturnValue().Set(exports);
}

static void Exit(const FunctionCallbackInfo<Value>& args) {
  exit(args[0]->Int32Value());
}

static void SetCallbacks(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  ivan::promise_reject_handler.Set(isolate, args[0].As<Function>());
  ivan::next_tick_handler.Set(isolate, args[1].As<Function>());
  ivan::exit_handler.Set(isolate, args[2].As<Function>());

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

    Local<Function> handler = ivan::promise_reject_handler.Get(isolate);
    USE(handler->Call(context, v8::Undefined(isolate), 3, args));
  });
}

static const char* v8_argv[] = {
  "--harmony-class-fields",
  "--harmony-static-fields",
  "--harmony-private-fields",
  "--harmony-public-fields",
  "--harmony-subsume-json",
  "--harmony-regexp-named-expressions",
  "--harmony-do-expressions",
  "--allow-natives-syntax",
};
static int v8_argc = std::size(v8_argv);

int main(int argc, char** argv) {
  argv = uv_setup_args(argc, argv);

  V8::SetFlagsFromCommandLine(&v8_argc, const_cast<char**>(v8_argv), true);

  ivan::IvanPlatform* platform = new ivan::IvanPlatform(4);
  V8::InitializePlatform(platform);
  V8::Initialize();

  Isolate::CreateParams create_params;
  create_params.array_buffer_allocator =
      ArrayBuffer::Allocator::NewDefaultAllocator();
  Isolate* isolate = Isolate::New(create_params);

  platform->RegisterIsolate(isolate, uv_default_loop());

  isolate->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);

#define V(name) _ivan_register_##name()
  IVAN_INTERNAL_MODULES(V)
#undef V

  {
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);

    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    context->SetEmbedderData(ivan::EmbedderKeys::kBindingCache, Object::New(isolate));
    context->SetAlignedPointerInEmbedderData(ivan::EmbedderKeys::kInspector, nullptr);

    Local<Object> process = Object::New(isolate);

    Local<Array> pargv = Array::New(isolate, argc);
    IVAN_SET_PROPERTY(context, process, "argv", pargv);
    for (int i = 0; i < argc; i++)
      USE(pargv->Set(context, i, String::NewFromUtf8(isolate, argv[i])));

    Local<Object> versions = Object::New(isolate);

    IVAN_SET_PROPERTY(context, process, "versions", versions);
    IVAN_SET_PROPERTY(context, versions, "v8", V8::GetVersion());
    IVAN_SET_PROPERTY(context, versions, "uv", uv_version_string());

    IVAN_SET_PROPERTY(context, process, "exit", Exit);

    {
      char buf[PATH_MAX];
      size_t cwd_len = sizeof(buf);
      int err = uv_cwd(buf, &cwd_len);
      if (err) {
        fprintf(stderr, "uv error");
        exit(err);
      }

      Local<String> cwd = String::NewFromUtf8(
          isolate, buf, String::kNormalString, cwd_len);

      IVAN_SET_PROPERTY(context, process, "cwd", cwd);
    }

    int argc = 3;
    Local<Value> args[] = {
      process,
      FunctionTemplate::New(isolate, Bindings)->GetFunction(),
      FunctionTemplate::New(isolate, SetCallbacks)->GetFunction(),
    };

    TryCatch try_catch(isolate);

    MaybeLocal<Value> ivan_fn_maybe = ivan::ScriptWrap::Internal(
        isolate, IVAN_STRING(isolate, "ivan"),
        ivan::blobs::MainSource(isolate));

    Local<Value> ivan_fn;
    if (ivan_fn_maybe.ToLocal(&ivan_fn))
      USE(ivan_fn.As<Function>()->Call(context, context->Global(), argc, args));

    uv_loop_t* event_loop = uv_default_loop();
    int more = 1;
    do {
      uv_run(event_loop, UV_RUN_DEFAULT);

      platform->DrainTasks(isolate);

      ivan::InternalCallbackScope::Run(isolate);

      more = uv_loop_alive(event_loop);
    } while (more == 1);

    if (!ivan::exit_handler.IsEmpty()) {
      USE(ivan::exit_handler.Get(isolate)->Call(context, context->Global(), 0, {}));
    }

    if (try_catch.HasCaught())
      ivan::errors::ReportException(isolate, &try_catch);
  }

  ivan::id_to_script_map.clear();

  platform->UnregisterIsolate(isolate);
  isolate->Dispose();
  V8::Dispose();
  V8::ShutdownPlatform();
  delete create_params.array_buffer_allocator;
  uv_tty_reset_mode();
  return 0;
}
