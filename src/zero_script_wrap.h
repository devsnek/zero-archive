#ifndef SRC_ZERO_SCRIPT_WRAP_H_
#define SRC_ZERO_SCRIPT_WRAP_H_

#include <memory>

#include "v8.h"

namespace zero {
namespace ScriptWrap {

static uint32_t script_id = 0;

v8::MaybeLocal<v8::Value> Internal(
    v8::Isolate* isolate, v8::Local<v8::String> filename, v8::Local<v8::String> code) {
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::Local<v8::PrimitiveArray> host_defined_options = v8::PrimitiveArray::New(isolate, 2);
  host_defined_options->Set(0, v8::Integer::New(isolate, 0));

  v8::Local<v8::Integer> id = v8::Integer::New(isolate, script_id++);

  v8::ScriptOrigin origin(filename,
                          v8::Integer::New(isolate, 0),
                          v8::Integer::New(isolate, 0),
                          v8::False(isolate),
                          id,
                          v8::Local<v8::Value>(),
                          v8::False(isolate),
                          v8::False(isolate),
                          v8::False(isolate),
                          host_defined_options);
  v8::ScriptCompiler::Source source(code, origin);

  v8::Local<v8::UnboundScript> script;
  if (v8::ScriptCompiler::CompileUnboundScript(
        isolate, &source, v8::ScriptCompiler::kNoCompileOptions).ToLocal(&script)) {
    host_defined_options->Set(1, id);
    id_to_script_map.emplace(id->Value(), v8::Global<v8::UnboundScript>(isolate, script));
    return script->BindToCurrentContext()->Run(context);
  }

  return v8::MaybeLocal<v8::Value>();
}

static void Exposed(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();

  v8::Local<v8::Value> val;
  if (Internal(isolate, args[0].As<v8::String>(), args[1].As<v8::String>()).ToLocal(&val)) {
    args.GetReturnValue().Set(val);
  }
}

static void FunctionCacheCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::Local<v8::Function> that = args.This().As<v8::Function>();
  std::unique_ptr<v8::ScriptCompiler::CachedData> cached_data(
      v8::ScriptCompiler::CreateCodeCacheForFunction(that));

  auto data = reinterpret_cast<void*>(Malloc(cached_data->length));
  memcpy(data, cached_data->data, cached_data->length);

  v8::Local<v8::ArrayBuffer> buf = v8::ArrayBuffer::New(
      isolate,
      data,
      cached_data->length);

  free(data);

  args.GetReturnValue().Set(v8::Uint8Array::New(buf, 0, buf->ByteLength()));
}

static void CreateFunction(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::Local<v8::String> name = args[0].As<v8::String>();
  v8::Local<v8::String> code = args[1].As<v8::String>();
  v8::Local<v8::Array> params = args[2].As<v8::Array>();
  v8::Local<v8::Array> extensions = args[3].As<v8::Array>();

  v8::ScriptOrigin origin(name);
  v8::ScriptCompiler::Source source(code, origin);

  v8::TryCatch try_catch(isolate);
  v8::Context::Scope scope(context);

  v8::Local<v8::String>* cparams = Malloc<v8::Local<v8::String>>(params->Length());
  for (uint32_t i = 0; i < params->Length(); i += 1) {
    cparams[i] = params->Get(context, i).ToLocalChecked().As<v8::String>();
  }

  v8::Local<v8::Object>* cextensions = Malloc<v8::Local<v8::Object>>(extensions->Length());
  for (uint32_t i = 0; i < extensions->Length(); i += 1) {
    cextensions[i] = extensions->Get(context, i).ToLocalChecked().As<v8::Object>();
  }

  v8::MaybeLocal<v8::Function> maybe_fn = v8::ScriptCompiler::CompileFunctionInContext(
      context, &source, params->Length(), cparams, extensions->Length(), cextensions);

  free(cparams);
  free(cextensions);

  v8::Local<v8::Function> fn;
  if (maybe_fn.IsEmpty() || !maybe_fn.ToLocal(&fn)) {
    try_catch.ReThrow();
    return;
  }

  fn->Set(
      context,
      ZERO_STRING(isolate, "createCodeCache"),
      v8::Function::New(isolate, FunctionCacheCallback)).ToChecked();

  args.GetReturnValue().Set(fn);
}

void Init(v8::Local<v8::Context> context, v8::Local<v8::Object> exports) {
  ZERO_SET_PROPERTY(context, exports, "run", Exposed);
  ZERO_SET_PROPERTY(context, exports, "createFunction", CreateFunction);
}

}  // namespace ScriptWrap
}  // namespace zero

ZERO_REGISTER_INTERNAL(script_wrap, zero::ScriptWrap::Init);

#endif  // SRC_ZERO_SCRIPT_WRAP_H_
