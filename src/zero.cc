#include <uv.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>  // PATH_MAX

#include "v8.h"
#include "zero.h"
#include "zero_script_wrap.h"
#include "zero_blobs.h"
#include "zero_errors.h"
#include "zero_platform.h"

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
using v8::Name;
using v8::Number;
using v8::Isolate;
using v8::Object;
using v8::ObjectTemplate;
using v8::String;
using v8::Value;
using v8::V8;
using v8::Persistent;
using v8::Platform;
using v8::Promise;
using v8::PropertyCallbackInfo;
using v8::TryCatch;

#define ZERO_INTERNAL_MODULES(V) \
  V(encoding);                   \
  V(util);                       \
  V(module_wrap);                \
  V(script_wrap);                \
  V(fs);                         \
  V(tty);                        \
  V(debug);                      \
  V(performance);                \
  V(tcp_wrap);                   \
  V(inspector_sync);             \
  V(types);                      \
  V(timer_wrap);                 \
  V(ffi);


#define V(name) void _zero_register_##name()
ZERO_INTERNAL_MODULES(V)
#undef V

namespace zero {

static zero_module* modlist;

void zero_module_register(void* m) {
  struct zero_module* mp = reinterpret_cast<struct zero_module*>(m);

  mp->im_link = modlist;
  modlist = mp;
}

inline struct zero_module* get_module(const char* name) {
  struct zero_module* mp;

  for (mp = modlist; mp != nullptr; mp = mp->im_link) {
    if (strcmp(mp->im_name, name) == 0)
      break;
  }

  return mp;
}

namespace js_debug {

static void DebugLog(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  String::Utf8Value utf8(isolate, args[0].As<String>());
  bool prefix = args[1]->IsTrue();

  fprintf(stdout, "%s%s", prefix ? "[zero] " : "", *utf8);
  fflush(stdout);
}

static void DebugError(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  String::Utf8Value utf8(isolate, args[0].As<String>());
  bool prefix = args[1]->IsTrue();

  fprintf(stderr, "%s%s", prefix ? "[zero] " : "", *utf8);
  fflush(stderr);
}

static void Init(Local<Context> context, Local<Object> exports) {
  ZERO_SET_PROPERTY(context, exports, "log", DebugLog);
  ZERO_SET_PROPERTY(context, exports, "error", DebugError);
}

}  // namespace js_debug
}  // namespace zero

ZERO_REGISTER_INTERNAL(debug, zero::js_debug::Init);

static void Bindings(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<Context> context = isolate->GetCurrentContext();

  Local<String> req = args[0].As<String>();

  Local<Object> cache =
      context->GetEmbedderData(zero::EmbedderKeys::kBindingCache).As<Object>();
  if (cache->HasOwnProperty(context, req).FromMaybe(false)) {
    args.GetReturnValue().Set(cache->Get(context, req).ToLocalChecked());
    return;
  }

  String::Utf8Value request(isolate, req);

  Local<Object> exports = Object::New(isolate);

  if (strcmp(*request, "natives") == 0) {
    zero::blobs::DefineJavaScript(isolate, exports);
  } else {
    zero::zero_module* mod = zero::get_module(*request);
    if (mod != nullptr) {
      mod->im_function(context, exports);
    } else {
      ZERO_THROW_EXCEPTION(isolate, "unknown binding");
      return;
    }
  }

  USE(cache->Set(context, req, exports));
  args.GetReturnValue().Set(exports);
}

static void Exit(const FunctionCallbackInfo<Value>& args) {
  exit(args[0]->Int32Value());
}

void PromiseRejectCallback(v8::PromiseRejectMessage message) {
  Local<Promise> promise = message.GetPromise();
  Isolate* isolate = promise->GetIsolate();
  Local<Value> value = message.GetValue();
  v8::PromiseRejectEvent event = message.GetEvent();

  Local<Function> cb = zero::promise_callback.Get(isolate);

  Local<Value> args[] = {
    Number::New(isolate, event),
    promise,
    value,
  };
  if (value.IsEmpty()) {
    args[2] = v8::Undefined(isolate);
  }

  cb->Call(isolate->GetCurrentContext(), cb, 3, args).ToLocalChecked();
}

static void SetCallbacks(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  zero::exit_handler.Set(isolate, args[0].As<Function>());
  zero::promise_callback.Set(isolate, args[1].As<Function>());

  isolate->SetPromiseRejectCallback(PromiseRejectCallback);
}

static const char* v8_argv[] = {
  "--harmony-class-fields",
  "--harmony-static-fields",
  "--harmony-private-fields",
  "--harmony-public-fields",
  "--harmony-do-expressions",
  "--allow-natives-syntax",
  "--experimental-extras",
  "--enable-experimental-builtins",
  "--harmony-intl-relative-time-format",
};
static int v8_argc = zero::arraysize(v8_argv);

int main(int process_argc, char** process_argv) {
  process_argv = uv_setup_args(process_argc, process_argv);

  char** argv = zero::Malloc<char*>(process_argc + v8_argc);
  argv[0] = process_argv[0];  // grab argv0 which is the process
  int argc = 1;
  int pick_up_double_dash = -1;

  for (int i = 0; i < v8_argc; i += 1) {
    argv[argc++] = const_cast<char*>(v8_argv[i]);
  }
  for (int i = 1; i < process_argc; i += 1) {
    char* arg = process_argv[i];
    // V8 can't handle double-dash
    if (strcmp(arg, "--") == 0) {
      pick_up_double_dash = i;
      break;
    }
    argv[argc++] = arg;
  }
  argv[argc] = 0;

  v8::V8::InitializeICU();

  V8::SetFlagsFromCommandLine(&argc, const_cast<char**>(argv), true);
  // argv and argc have been modified to include arguments not used by V8

  if (pick_up_double_dash != -1) {
    for (int i = pick_up_double_dash; i < process_argc; i += 1) {
      argv[argc++] = process_argv[i];
    }
    argv[argc] = 0;
  }

  zero::platform = new zero::ZeroPlatform(4);
  V8::InitializePlatform(zero::platform);
  V8::Initialize();

  Isolate::CreateParams create_params;
  create_params.array_buffer_allocator =
      ArrayBuffer::Allocator::NewDefaultAllocator();
  Isolate* isolate = Isolate::New(create_params);

  zero::platform->RegisterIsolate(isolate, uv_default_loop());

  isolate->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);
  isolate->SetCaptureStackTraceForUncaughtExceptions(true);

#define V(name) _zero_register_##name()
  ZERO_INTERNAL_MODULES(V)
#undef V

  {
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);

    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    context->SetEmbedderData(zero::EmbedderKeys::kBindingCache, Object::New(isolate));
    context->SetAlignedPointerInEmbedderData(zero::EmbedderKeys::kInspector, nullptr);

    Local<Object> process = Object::New(isolate);

    Local<Array> pargv = Array::New(isolate, argc);
    ZERO_SET_PROPERTY(context, process, "argv", pargv);
    for (int i = 0; i < argc; i++)
      USE(pargv->Set(context, i, ZERO_STRING(isolate, argv[i])));

    Local<Object> versions = Object::New(isolate);

    ZERO_SET_PROPERTY(context, process, "versions", versions);
    ZERO_SET_PROPERTY(context, versions, "v8", V8::GetVersion());
    ZERO_SET_PROPERTY(context, versions, "uv", uv_version_string());

    ZERO_SET_PROPERTY(context, process, "exit", Exit);
    ZERO_SET_PROPERTY(context, process, "isLittleEndian", zero::IsLittleEndian());

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

      ZERO_SET_PROPERTY(context, process, "cwd", cwd);
    }

    int argc = 3;
    Local<Value> args[] = {
      process,
      FunctionTemplate::New(isolate, Bindings)->GetFunction(),
      FunctionTemplate::New(isolate, SetCallbacks)->GetFunction(),
    };

    TryCatch try_catch(isolate);

    MaybeLocal<Value> zero_fn_maybe = zero::ScriptWrap::Run(
        isolate, ZERO_STRING(isolate, "zero"),
        zero::blobs::MainSource(isolate));

    Local<Value> zero_fn;
    if (zero_fn_maybe.ToLocal(&zero_fn))
      USE(zero_fn.As<Function>()->Call(context, context->Global(), argc, args));

    uv_loop_t* event_loop = uv_default_loop();
    int more = 1;
    do {
      uv_run(event_loop, UV_RUN_DEFAULT);

      zero::platform->DrainTasks(isolate);

      zero::InternalCallbackScope::Run(isolate);

      more = uv_loop_alive(event_loop);
    } while (more == 1);

    if (!zero::exit_handler.IsEmpty()) {
      Local<Function> ecb = zero::exit_handler.Get(isolate);
      USE(ecb->Call(context, context->Global(), 0, {}));
    }

    if (try_catch.HasCaught())
      zero::errors::ReportException(isolate, &try_catch);
  }

  zero::platform->UnregisterIsolate(isolate);
  isolate->Dispose();
  V8::Dispose();
  V8::ShutdownPlatform();
  delete create_params.array_buffer_allocator;
  uv_tty_reset_mode();
  return 0;
}
