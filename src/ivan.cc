#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libplatform/libplatform.h>
#include <v8.h>
#include "ivan.h"
#include "ivan_script_wrap.h"
#include "ivan_blobs.h"

using namespace v8;

#define V(name) void _register_##name()
V(io);
V(util);
// V(module_wrap);
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

} // namespace ivan

static void Bindings(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  Local<Context> context = isolate->GetCurrentContext();

  Local<String> req = info[0].As<String>();

  Local<Object> cache = context->GetEmbedderData(ivan::EmbedderKeys::BindingCache).As<Object>();
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
    if (mod != nullptr)
      mod->im_function(isolate, exports);
  }

  USE(cache->Set(context, req, exports));
  info.GetReturnValue().Set(exports);
}

static void DebugLog(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  String::Utf8Value utf8(isolate, info[0].As<String>());
  bool prefix = info[1]->IsTrue();

  fprintf(stdout, "%s%s\n", prefix ? "[IVAN] " : "", *utf8);
}

static void DebugError(const FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  HandleScope handle_scope(isolate);

  String::Utf8Value utf8(isolate, info[0].As<String>());
  bool prefix = info[1]->IsTrue();

  fprintf(stderr, "%s%s\n", prefix ? "[IVAN] " : "", *utf8);
}

int main(int argc, char* argv[]) {
  std::unique_ptr<Platform> platform = platform::NewDefaultPlatform();
  V8::InitializePlatform(platform.get());
  V8::Initialize();

  Isolate::CreateParams create_params;
  create_params.array_buffer_allocator = ArrayBuffer::Allocator::NewDefaultAllocator();
  Isolate* isolate = Isolate::New(create_params);

  isolate->SetMicrotasksPolicy(MicrotasksPolicy::kAuto); // TODO: change to kExplicit

#define V(name) _register_##name()
  V(io);
  V(util);
  // V(module_wrap);
#undef V

  {
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);

    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    context->SetEmbedderData(ivan::EmbedderKeys::BindingCache, Object::New(isolate));

    USE(context->Global()->Set(context, String::NewFromUtf8(isolate, "global"), context->Global()));

    Local<Function> ivan_fn = ivan::ScriptWrap::Internal(
        isolate, String::NewFromUtf8(isolate, "ivan"), ivan::blobs::MainSource(isolate)).As<Function>();

    Local<Object> process = Object::New(isolate);
    Local<Array> pargv = Array::New(isolate, argc);
    USE(process->Set(context, String::NewFromUtf8(isolate, "argv"), pargv));
    for (int i = 0; i < argc; i++)
      USE(pargv->Set(context, i, String::NewFromUtf8(isolate, argv[i])));

    Local<Object> debug = Object::New(isolate);
    USE(debug->Set(context, String::NewFromUtf8(isolate, "log"), FunctionTemplate::New(isolate, DebugLog)->GetFunction()));
    USE(debug->Set(context, String::NewFromUtf8(isolate, "error"), FunctionTemplate::New(isolate, DebugError)->GetFunction()));

    int argc = 4;
    Local<Value> args[] = {
      process,
      FunctionTemplate::New(isolate, ivan::ScriptWrap::Exposed)->GetFunction(),
      FunctionTemplate::New(isolate, Bindings)->GetFunction(),
      debug,
    };
    
    USE(ivan_fn->Call(context, context->Global(), argc, args));
  }

  isolate->Dispose();
  V8::Dispose();
  V8::ShutdownPlatform();
  delete create_params.array_buffer_allocator;
  return 0;
}
