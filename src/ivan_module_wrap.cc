#include <v8.h>
#include "ivan.h"
#include "ivan_module_wrap.h"

using namespace v8;

namespace ivan {

ModuleWrap::ModuleWrap(Isolate* isolate, const char* url, Local<String> source_text) {
  HandleScope handle_scope(isolate);
  Local<Context> context = Context::New(isolate);

  Context::Scope context_scope(context);

  Local<Module> module;
  {
    ScriptOrigin origin(String::NewFromUtf8(isolate, url),
                        Integer::New(isolate, 0),             // line offset
                        Integer::New(isolate, 0),             // column offset
                        False(isolate),                       // is cross origin
                        Local<Integer>(),                     // script id
                        Local<Value>(),                       // source map URL
                        False(isolate),                       // is opaque (?)
                        False(isolate),                       // is WASM
                        True(isolate));                       // is ES6 module
    TryCatch try_catch(isolate);
    ScriptCompiler::Source source(source_text, origin);
    if (!ScriptCompiler::CompileModule(isolate, &source).ToLocal(&module)) {
      CHECK(try_catch.HasCaught());
      CHECK(!try_catch.Message().IsEmpty());
      CHECK(!try_catch.Exception().IsEmpty());
      try_catch.ReThrow();
      return;
    }
  }

  this->isolate_ = isolate;
  this->module_.Reset(isolate, module);
}

ModuleWrap::~ModuleWrap() {
  this->module_.Reset();
  this->result_.Reset();
}

void ModuleWrap::Instantiate() {
  Isolate* isolate = this->isolate_;
  USE(this->module_.Get(isolate)->InstantiateModule(isolate->GetCurrentContext(), ModuleWrap::ResolveCallback));
}

Local<Value> ModuleWrap::Evaluate() {
  Isolate* isolate = this->isolate_;
  Local<Module> module = this->module_.Get(isolate);

  if (module->GetStatus() != Module::Status::kInstantiated)
    this->Instantiate();

  Local<Value> result = module->Evaluate(isolate->GetCurrentContext()).ToLocalChecked();
  this->result_.Reset(isolate, result);
  return result;
}

Local<Value> ModuleWrap::Result() {
  return this->result_.Get(this->isolate_);
}

MaybeLocal<Module> ModuleWrap::ResolveCallback(
    Local<Context> context, Local<String> specifier, Local<Module> referrer) {
  return MaybeLocal<Module>();
}

} // namespace ivan
