#include <algorithm>
#include "zero_module_wrap.h"
#include "zero.h"

namespace zero {
namespace loader {

using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::HandleScope;
using v8::Integer;
using v8::IntegrityLevel;
using v8::Isolate;
using v8::Just;
using v8::Local;
using v8::Maybe;
using v8::MaybeLocal;
using v8::Module;
using v8::Nothing;
using v8::Object;
using v8::PrimitiveArray;
using v8::Promise;
using v8::ScriptCompiler;
using v8::ScriptOrigin;
using v8::String;
using v8::TryCatch;
using v8::UnboundScript;
using v8::Undefined;
using v8::Value;

v8::Persistent<v8::Function> ModuleWrap::host_initialize_import_meta_object_callback;
v8::Persistent<v8::Function> ModuleWrap::host_import_module_dynamically_callback;

ModuleWrap::ModuleWrap(Isolate* isolate,
                       Local<Object> object,
                       Local<Module> module) : BaseObject(isolate, object) {
  module_.Reset(isolate, module);
}

ModuleWrap::~ModuleWrap() {
  HandleScope scope(isolate());
  Local<Module> module = module_.Get(isolate());
  auto range = module_to_module_wrap_map.equal_range(
      module->GetIdentityHash());
  for (auto it = range.first; it != range.second; ++it) {
    if (it->second == this) {
      module_to_module_wrap_map.erase(it);
      break;
    }
  }
}

ModuleWrap* ModuleWrap::GetFromModule(Local<Module> module) {
  auto range = module_to_module_wrap_map.equal_range(module->GetIdentityHash());
  for (auto it = range.first; it != range.second; ++it) {
    if (it->second->module_ == module)
      return it->second;
  }
  return nullptr;
}

void ModuleWrap::New(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  CHECK(args.IsConstructCall());
  Local<Object> that = args.This();

  const int argc = args.Length();
  CHECK_EQ(argc, 2);

  CHECK(args[0]->IsString());
  Local<String> source_text = args[0].As<String>();

  CHECK(args[1]->IsString());
  Local<String> url = args[1].As<String>();

  Local<Context> context = that->CreationContext();

  Local<Module> module;

  TryCatch try_catch(isolate);

  // compile
  {
    ScriptOrigin origin(url,
                        Integer::New(isolate, 0),             // line offset
                        Integer::New(isolate, 0),             // column offset
                        False(isolate),                       // is cross origin
                        Local<Integer>(),                     // script id
                        Local<Value>(),                       // source map URL
                        False(isolate),                       // is opaque (?)
                        False(isolate),                       // is WASM
                        True(isolate));                       // is ES6 module
    Context::Scope context_scope(context);
    ScriptCompiler::Source source(source_text, origin);
    if (!ScriptCompiler::CompileModule(isolate, &source).ToLocal(&module)) {
      try_catch.ReThrow();
      return;
    }
  }

  if (!that->Set(context, ZERO_STRING(isolate, "url"), url).FromMaybe(false)) {
    // try_catch.ReThrow();
    return;
  }

  ModuleWrap* obj = new ModuleWrap(isolate, that, module);
  obj->context_.Reset(isolate, context);

  module_to_module_wrap_map.emplace(module->GetIdentityHash(), obj);

  that->SetIntegrityLevel(context, IntegrityLevel::kFrozen);
  args.GetReturnValue().Set(that);
}

void ModuleWrap::Link(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());

  Local<Object> that = args.This();

  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, that);

  if (obj->linked_)
    return;
  obj->linked_ = true;

  Local<Function> resolver_arg = args[0].As<Function>();

  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  Local<Array> promises = Array::New(isolate,
                                     module->GetModuleRequestsLength());

  // call the dependency resolve callbacks
  for (int i = 0; i < module->GetModuleRequestsLength(); i++) {
    Local<String> specifier = module->GetModuleRequest(i);
    String::Utf8Value specifier_utf8(isolate, specifier);
    std::string specifier_std(*specifier_utf8, specifier_utf8.length());

    Local<Value> argv[] = {
      specifier
    };

    MaybeLocal<Value> maybe_resolve_return_value =
        resolver_arg->Call(context, that, 1, argv);
    if (maybe_resolve_return_value.IsEmpty()) {
      return;
    }
    Local<Value> resolve_return_value =
        maybe_resolve_return_value.ToLocalChecked();
    if (!resolve_return_value->IsPromise()) {
      ZERO_THROW_EXCEPTION(isolate, "linking error, expected resolver to return a promise");
    }
    Local<Promise> resolve_promise = resolve_return_value.As<Promise>();
    obj->resolve_cache_[specifier_std].Reset(isolate, resolve_promise);

    promises->Set(context, i, resolve_promise).FromJust();
  }

  args.GetReturnValue().Set(promises);
}

void ModuleWrap::Instantiate(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);
  Maybe<bool> ok = module->InstantiateModule(context, ModuleWrap::ResolveCallback);

  // clear resolve cache on instantiate
  obj->resolve_cache_.clear();

  if (!ok.FromMaybe(false))
    return;
}

void ModuleWrap::Evaluate(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  TryCatch try_catch(isolate);

  MaybeLocal<Value> result = module->Evaluate(context);

  if (result.IsEmpty())
    try_catch.ReThrow();
  else
    args.GetReturnValue().Set(result.ToLocalChecked());
}

void ModuleWrap::GetNamespace(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  switch (module->GetStatus()) {
    default:
      return ZERO_THROW_EXCEPTION(
          isolate, "cannot get namespace, Module has not been instantiated");
    case v8::Module::Status::kInstantiated:
    case v8::Module::Status::kEvaluating:
    case v8::Module::Status::kEvaluated:
      break;
  }

  Local<Value> result = module->GetModuleNamespace();
  args.GetReturnValue().Set(result);
}

void ModuleWrap::GetStatus(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  args.GetReturnValue().Set(module->GetStatus());
}

void ModuleWrap::GetStaticDependencySpecifiers(
    const FunctionCallbackInfo<Value>& args) {
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  Local<Module> module = obj->module_.Get(isolate);

  int count = module->GetModuleRequestsLength();

  Local<Array> specifiers = Array::New(isolate, count);

  for (int i = 0; i < count; i++)
    specifiers->Set(context, i, module->GetModuleRequest(i)).FromJust();

  args.GetReturnValue().Set(specifiers);
}

void ModuleWrap::GetError(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  args.GetReturnValue().Set(module->GetException());
}

MaybeLocal<Module> ModuleWrap::ResolveCallback(Local<Context> context,
                                               Local<String> specifier,
                                               Local<Module> referrer) {
  Isolate* isolate = context->GetIsolate();

  ModuleWrap* dependent = ModuleWrap::GetFromModule(referrer);
  if (dependent == nullptr) {
    ZERO_THROW_EXCEPTION(isolate, "linking error, unknown module");
    return MaybeLocal<Module>();
  }

  String::Utf8Value specifier_utf8(isolate, specifier);
  std::string specifier_std(*specifier_utf8, specifier_utf8.length());

  if (dependent->resolve_cache_.count(specifier_std) != 1) {
    ZERO_THROW_EXCEPTION(isolate, "linking error, not in local cache");
    return MaybeLocal<Module>();
  }

  Local<Promise> resolve_promise =
      dependent->resolve_cache_[specifier_std].Get(isolate);

  if (resolve_promise->State() != Promise::kFulfilled) {
    ZERO_THROW_EXCEPTION(isolate,
        "linking error, dependency promises must be resolved on instantiate");
    return MaybeLocal<Module>();
  }

  Local<Object> module_object = resolve_promise->Result().As<Object>();
  if (module_object.IsEmpty() || !module_object->IsObject()) {
    ZERO_THROW_EXCEPTION(isolate,
        "linking error, expected a valid module object from resolver");
    return MaybeLocal<Module>();
  }

  ModuleWrap* module;
  ASSIGN_OR_RETURN_UNWRAP(&module, module_object, MaybeLocal<Module>());
  return module->module_.Get(isolate);
}

MaybeLocal<Promise> ModuleWrap::ImportModuleDynamically(
    Local<Context> context,
    Local<v8::ScriptOrModule> referrer,
    Local<String> specifier) {
  Isolate* iso = context->GetIsolate();
  v8::EscapableHandleScope handle_scope(iso);

  Local<Function> import_callback = host_import_module_dynamically_callback.Get(iso);

  Local<Value> args[] = {
    referrer->GetResourceName(),
    Local<Value>(specifier),
  };
  const int argc = 2;

  MaybeLocal<Value> maybe_result = import_callback->Call(context,
                                                         v8::Undefined(iso),
                                                         argc,
                                                         args);

  Local<Value> result;
  if (maybe_result.ToLocal(&result)) {
    return handle_scope.Escape(result.As<Promise>());
  }
  return MaybeLocal<Promise>();
}

void ModuleWrap::SetImportModuleDynamicallyCallback(
    const FunctionCallbackInfo<Value>& args) {
  Isolate* iso = args.GetIsolate();
  HandleScope handle_scope(iso);

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());
  Local<Function> import_callback = args[0].As<Function>();
  host_import_module_dynamically_callback.Reset(iso, import_callback);

  iso->SetHostImportModuleDynamicallyCallback(ModuleWrap::ImportModuleDynamically);
}

void ModuleWrap::HostInitializeImportMetaObjectCallback(
    Local<Context> context, Local<Module> module, Local<Object> meta) {
  Isolate* isolate = context->GetIsolate();
  ModuleWrap* module_wrap = ModuleWrap::GetFromModule(module);

  if (module_wrap == nullptr)
    return;

  Local<Function> callback = host_initialize_import_meta_object_callback.Get(isolate);

  Local<Value> args[] = { meta, module_wrap->object() };

  TryCatch try_catch(isolate);
  USE(callback->Call(context, Undefined(isolate), 2, args));
  if (try_catch.HasCaught())
    try_catch.ReThrow();
}

void ModuleWrap::SetInitializeImportMetaObjectCallback(
    const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());
  Local<Function> import_meta_callback = args[0].As<Function>();
  host_initialize_import_meta_object_callback.Reset(isolate, import_meta_callback);

  isolate->SetHostInitializeImportMetaObjectCallback(
      HostInitializeImportMetaObjectCallback);
}

void ModuleWrap::Initialize(Local<Context> context, Local<Object> target) {
  Isolate* isolate = context->GetIsolate();

  Local<FunctionTemplate> tpl = BaseObject::MakeJSTemplate(isolate, "ModuleWrap", New);

  ZERO_SET_PROTO_PROP(context, tpl, "link", Link);
  ZERO_SET_PROTO_PROP(context, tpl, "instantiate", Instantiate);
  ZERO_SET_PROTO_PROP(context, tpl, "evaluate", Evaluate);
  ZERO_SET_PROTO_PROP(context, tpl, "getNamespace", GetNamespace);
  ZERO_SET_PROTO_PROP(context, tpl, "getStatus", GetStatus);
  ZERO_SET_PROTO_PROP(context, tpl, "getError", GetError);
  ZERO_SET_PROTO_PROP(context, tpl, "getStaticDependencySpecifiers",
                      GetStaticDependencySpecifiers);

  target->Set(ZERO_STRING(isolate, "ModuleWrap"), tpl->GetFunction());
  ZERO_SET_PROPERTY(context, target,
                    "setImportModuleDynamicallyCallback",
                    ModuleWrap::SetImportModuleDynamicallyCallback);
  ZERO_SET_PROPERTY(context, target,
                    "setInitializeImportMetaObjectCallback",
                    ModuleWrap::SetInitializeImportMetaObjectCallback);

#define V(name) \
  ZERO_SET_PROPERTY(context, target, #name, v8::Module::name);
  V(kUninstantiated);
  V(kInstantiating);
  V(kInstantiated);
  V(kEvaluating);
  V(kEvaluated);
  V(kErrored);
#undef V
}

}  // namespace loader
}  // namespace zero

ZERO_REGISTER_INTERNAL(module_wrap, zero::loader::ModuleWrap::Initialize);
