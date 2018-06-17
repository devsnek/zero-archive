#include <uv.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h> // PATH_MAX
#include <iterator>  // std::size

#include "v8.h"
#include "edge.h"
#include "edge_script_wrap.h"
#include "edge_blobs.h"
#include "edge_errors.h"
#include "edge_platform.h"

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
using v8::Number;
using v8::Isolate;
using v8::Object;
using v8::String;
using v8::Value;
using v8::V8;
using v8::Persistent;
using v8::Platform;
using v8::Promise;
using v8::TryCatch;

#define EDGE_INTERNAL_MODULES(V) \
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
  V(ffi);


#define V(name) void _edge_register_##name()
EDGE_INTERNAL_MODULES(V)
#undef V

namespace edge {

static edge_module* modlist;

void edge_module_register(void* m) {
  struct edge_module* mp = reinterpret_cast<struct edge_module*>(m);

  mp->im_link = modlist;
  modlist = mp;
}

inline struct edge_module* get_module(const char* name) {
  struct edge_module* mp;

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

  fprintf(stdout, "%s%s", prefix ? "[edge] " : "", *utf8);
  fflush(stdout);
}

static void DebugError(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();

  String::Utf8Value utf8(isolate, info[0].As<String>());
  bool prefix = info[1]->IsTrue();

  fprintf(stderr, "%s%s", prefix ? "[edge] " : "", *utf8);
  fflush(stderr);
}

static void Init(Local<Context> context, Local<Object> exports) {
  EDGE_SET_PROPERTY(context, exports, "log", DebugLog);
  EDGE_SET_PROPERTY(context, exports, "error", DebugError);
}

}  // namespace js_debug
}  // namespace edge

EDGE_REGISTER_INTERNAL(debug, edge::js_debug::Init);

static void Bindings(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<Context> context = isolate->GetCurrentContext();

  Local<String> req = info[0].As<String>();

  Local<Object> cache =
      context->GetEmbedderData(edge::EmbedderKeys::kBindingCache).As<Object>();
  if (cache->HasOwnProperty(context, req).FromMaybe(false)) {
    info.GetReturnValue().Set(cache->Get(context, req).ToLocalChecked());
    return;
  }

  String::Utf8Value request(isolate, req);

  Local<Object> exports = Object::New(isolate);

  if (strcmp(*request, "natives") == 0) {
    edge::blobs::DefineJavaScript(isolate, exports);
  } else {
    edge::edge_module* mod = edge::get_module(*request);
    if (mod != nullptr) {
      mod->im_function(context, exports);
    } else {
      EDGE_THROW_EXCEPTION(isolate, "unknown binding");
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

  edge::exit_handler.Set(isolate, args[0].As<Function>());
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
};
static int v8_argc = std::size(v8_argv);

int main(int process_argc, char** process_argv) {
  process_argv = uv_setup_args(process_argc, process_argv);

  char** argv = edge::Malloc<char*>(process_argc + v8_argc);
  argv[0] = process_argv[0]; // grab argv0 which is the process
  int argc = 1;

  for (int i = 0; i < v8_argc; i += 1) {
    argv[argc++] = (char*) v8_argv[i];
  }
  for (int i = 1; i < process_argc; i += 1) {
    argv[argc++] = process_argv[i];
  }
  argv[argc++] = 0;

  v8::V8::InitializeICU();

  V8::SetFlagsFromCommandLine(&argc, const_cast<char**>(argv), true);
  // argv and argc have been modified to include arguments
  // not used by V8

  edge::EdgePlatform* platform = new edge::EdgePlatform(4);
  V8::InitializePlatform(platform);
  V8::Initialize();

  Isolate::CreateParams create_params;
  create_params.array_buffer_allocator =
      ArrayBuffer::Allocator::NewDefaultAllocator();
  Isolate* isolate = Isolate::New(create_params);

  platform->RegisterIsolate(isolate, uv_default_loop());

  isolate->SetMicrotasksPolicy(v8::MicrotasksPolicy::kExplicit);

#define V(name) _edge_register_##name()
  EDGE_INTERNAL_MODULES(V)
#undef V

  {
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);

    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    context->SetEmbedderData(edge::EmbedderKeys::kBindingCache, Object::New(isolate));
    context->SetAlignedPointerInEmbedderData(edge::EmbedderKeys::kInspector, nullptr);

    Local<Object> process = Object::New(isolate);

    Local<Array> pargv = Array::New(isolate, argc);
    EDGE_SET_PROPERTY(context, process, "argv", pargv);
    for (int i = 0; i < argc; i++)
      USE(pargv->Set(context, i, String::NewFromUtf8(isolate, argv[i])));

    Local<Object> versions = Object::New(isolate);

    EDGE_SET_PROPERTY(context, process, "versions", versions);
    EDGE_SET_PROPERTY(context, versions, "v8", V8::GetVersion());
    EDGE_SET_PROPERTY(context, versions, "uv", uv_version_string());

    EDGE_SET_PROPERTY(context, process, "exit", Exit);
    EDGE_SET_PROPERTY(context, process, "isLittleEndian", edge::IsLittleEndian());

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

      EDGE_SET_PROPERTY(context, process, "cwd", cwd);
    }

    int argc = 3;
    Local<Value> args[] = {
      process,
      FunctionTemplate::New(isolate, Bindings)->GetFunction(),
      FunctionTemplate::New(isolate, SetCallbacks)->GetFunction(),
    };

    TryCatch try_catch(isolate);

    MaybeLocal<Value> edge_fn_maybe = edge::ScriptWrap::Internal(
        isolate, EDGE_STRING(isolate, "edge"),
        edge::blobs::MainSource(isolate));

    Local<Value> edge_fn;
    if (edge_fn_maybe.ToLocal(&edge_fn))
      USE(edge_fn.As<Function>()->Call(context, context->Global(), argc, args));

    uv_loop_t* event_loop = uv_default_loop();
    int more = 1;
    do {
      uv_run(event_loop, UV_RUN_DEFAULT);

      platform->DrainTasks(isolate);

      edge::InternalCallbackScope::Run(isolate);

      more = uv_loop_alive(event_loop);
    } while (more == 1);

    if (!edge::exit_handler.IsEmpty()) {
      Local<Function> ecb = edge::exit_handler.Get(isolate);
      USE(ecb->Call(context, context->Global(), 0, {}));
    }

    if (try_catch.HasCaught())
      edge::errors::ReportException(isolate, &try_catch);
  }

  edge::id_to_script_map.clear();

  platform->UnregisterIsolate(isolate);
  isolate->Dispose();
  V8::Dispose();
  V8::ShutdownPlatform();
  delete create_params.array_buffer_allocator;
  uv_tty_reset_mode();
  return 0;
}
