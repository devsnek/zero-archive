#ifndef SRC_ZERO_SCRIPT_WRAP_H_
#define SRC_ZERO_SCRIPT_WRAP_H_

#include <memory>
#include <vector>

#include "v8.h"

namespace zero {
namespace ScriptWrap {

v8::MaybeLocal<v8::Value> Run(
    v8::Isolate* isolate, v8::Local<v8::String> filename, v8::Local<v8::String> code) {
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::ScriptOrigin origin(filename,
                          v8::Integer::New(isolate, 0),
                          v8::Integer::New(isolate, 0),
                          v8::False(isolate),
                          v8::Local<v8::Integer>(),
                          v8::Local<v8::Value>(),
                          v8::False(isolate),
                          v8::False(isolate),
                          v8::False(isolate));
  v8::ScriptCompiler::Source source(code, origin);

  v8::Local<v8::UnboundScript> script;
  if (v8::ScriptCompiler::CompileUnboundScript(
        isolate, &source, v8::ScriptCompiler::kNoCompileOptions).ToLocal(&script)) {
    return script->BindToCurrentContext()->Run(context);
  }

  return v8::MaybeLocal<v8::Value>();
}

static void Run(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();

  v8::Local<v8::Value> val;
  if (Run(isolate, args[0].As<v8::String>(), args[1].As<v8::String>()).ToLocal(&val)) {
    args.GetReturnValue().Set(val);
  }
}

void Init(v8::Local<v8::Context> context, v8::Local<v8::Object> exports) {
  ZERO_SET_PROPERTY(context, exports, "run", Run);
}

}  // namespace ScriptWrap
}  // namespace zero

ZERO_REGISTER_INTERNAL(script_wrap, zero::ScriptWrap::Init);

#endif  // SRC_ZERO_SCRIPT_WRAP_H_
