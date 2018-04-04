#ifndef SRC_IVAN_SCRIPT_WRAP_H_
#define SRC_IVAN_SCRIPT_WRAP_H_

#include <v8.h>

namespace ivan {
namespace ScriptWrap {

v8::MaybeLocal<v8::Value> Internal(
    v8::Isolate* isolate, v8::Local<v8::String> filename, v8::Local<v8::String> code) {
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::TryCatch try_catch(isolate);

  v8::ScriptOrigin origin(filename, v8::Integer::New(isolate, 0), v8::Integer::New(isolate, 0));
  v8::ScriptCompiler::Source source(code, origin);

  v8::Local<v8::UnboundScript> script = v8::ScriptCompiler::CompileUnboundScript(
      isolate, &source, v8::ScriptCompiler::kNoCompileOptions).ToLocalChecked();

  v8::MaybeLocal<v8::Value> result = script->BindToCurrentContext()->Run(context);

  if (try_catch.HasCaught())
    try_catch.ReThrow();

  return result;
}

static void Exposed(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();

  v8::Local<v8::Value> val;
  if (Internal(isolate, info[0].As<v8::String>(), info[1].As<v8::String>()).ToLocal(&val)) {
    info.GetReturnValue().Set(val);
  } else {
    info.GetReturnValue().Set(v8::Undefined(isolate));
  }
}

void Init(v8::Isolate* isolate, v8::Local<v8::Object> exports) {
  IVAN_SET_METHOD(exports, "run", Exposed);
}

}  // namespace ScriptWrap
}  // namespace ivan

IVAN_REGISTER_INTERNAL(script_wrap, ivan::ScriptWrap::Init);

#endif  // SRC_IVAN_SCRIPT_WRAP_H_
