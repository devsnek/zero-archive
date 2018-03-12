#ifndef _SRC_IVAN_SCRIPT_WRAP_H
#define _SRC_IVAN_SCRIPT_WRAP_H

#include <v8.h>
#include "ivan_error.h"

namespace ivan {
namespace ScriptWrap {

v8::Local<v8::Value> Internal(v8::Isolate* isolate, v8::Local<v8::String> filename, v8::Local<v8::String> code) {
  v8::Local<v8::Context> context = isolate->GetCurrentContext();

  v8::TryCatch try_catch(isolate);
  
  v8::ScriptOrigin origin(filename, v8::Integer::New(isolate, 0), v8::Integer::New(isolate, 0));
  v8::ScriptCompiler::Source source(code, origin);

  v8::Local<v8::UnboundScript> script = v8::ScriptCompiler::CompileUnboundScript(isolate, &source, v8::ScriptCompiler::kNoCompileOptions).ToLocalChecked();

  v8::Local<v8::Value> result = script->BindToCurrentContext()->Run(context).ToLocalChecked();

  if (try_catch.HasCaught()) {
    ivan::DecorateException(isolate, try_catch);
    try_catch.ReThrow();
  }

  return result;
}

void Exposed(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  
  info.GetReturnValue().Set(Internal(isolate, info[0].As<v8::String>(), info[1].As<v8::String>()));
}

} // namespace ScriptWrap
} // namespace Ivan

#endif // _SRC_IVAN_SCRIPT_WRAP_H
