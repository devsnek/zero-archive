#ifndef SRC_IVAN_SCRIPT_WRAP_H_
#define SRC_IVAN_SCRIPT_WRAP_H_

#include "v8.h"

namespace ivan {
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

static void Exposed(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();

  v8::Local<v8::Value> val;
  if (Internal(isolate, info[0].As<v8::String>(), info[1].As<v8::String>()).ToLocal(&val))
    info.GetReturnValue().Set(val);
}

void Init(v8::Local<v8::Context> context, v8::Local<v8::Object> exports) {
  IVAN_SET_PROPERTY(context, exports, "run", Exposed);
}

}  // namespace ScriptWrap
}  // namespace ivan

IVAN_REGISTER_INTERNAL(script_wrap, ivan::ScriptWrap::Init);

#endif  // SRC_IVAN_SCRIPT_WRAP_H_
