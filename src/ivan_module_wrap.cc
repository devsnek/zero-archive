#include <algorithm>
#include "ivan_module_wrap.h"
#include "ivan.h"

namespace ivan {
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
using v8::JSON;
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
using v8::Undefined;
using v8::Value;

int ModuleWrap::Identity_ = 0;

ModuleWrap::ContextModuleData* ModuleWrap::GetModuleData(Local<Context> context) {
  ContextModuleData* module_data =
      reinterpret_cast<ContextModuleData*>(
          context->GetAlignedPointerFromEmbedderData(
              EmbedderKeys::kModuleData));
  if (module_data == nullptr) {
    module_data = new ContextModuleData;
    context->SetAlignedPointerInEmbedderData(
        EmbedderKeys::kModuleData, module_data);
  }
  return module_data;
}

ModuleWrap::ModuleWrap(Isolate* isolate,
                       Local<Object> object,
                       Local<Module> module,
                       Local<String> url) : BaseObject(isolate, object) {
  module_.Reset(isolate, module);
  url_.Reset(isolate, url);
  id = ModuleWrap::Identity_++;
}

ModuleWrap::~ModuleWrap() {
  HandleScope scope(isolate());
  Local<Module> module = module_.Get(isolate());
  auto data = GetModuleData(isolate()->GetCurrentContext());
  data->id_to_module_wrap_map.erase(id);
  auto range = data->module_to_module_wrap_map.equal_range(
      module->GetIdentityHash());
  for (auto it = range.first; it != range.second; ++it) {
    if (it->second == this) {
      data->module_to_module_wrap_map.erase(it);
      break;
    }
  }
}

ModuleWrap* ModuleWrap::GetFromID(Local<Context> context, int id) {
  auto map = GetModuleData(context)->id_to_module_wrap_map;
  auto module_wrap_it = map.find(id);
  if (module_wrap_it == map.end())
    return nullptr;

  return module_wrap_it->second;
}

ModuleWrap* ModuleWrap::GetFromModule(Local<Context> context,
                                      Local<Module> module) {
  auto map = GetModuleData(context)->module_to_module_wrap_map;
  auto range = map.equal_range(
      module->GetIdentityHash());
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
  CHECK_GE(argc, 2);

  CHECK(args[0]->IsString());
  Local<String> source_text = args[0].As<String>();

  CHECK(args[1]->IsString());
  Local<String> url = args[1].As<String>();

  Local<Context> context;
  Local<Integer> line_offset;
  Local<Integer> column_offset;
  Local<Function> import_module_dynamically;
  Local<Function> initialize_import_meta;

  if (argc == 7) {
    // new ModuleWrap(source, url, context?, lineOffset, columnOffset,
    //                importModuleDynamically?, initializeImportMeta?)
    if (args[2]->IsUndefined()) {
      context = that->CreationContext();
    } else {
      // CHECK(args[2]->IsObject());
      // ContextifyContext* sandbox =
      //     ContextifyContext::ContextFromContextifiedSandbox(
      //         env, args[2].As<Object>());
      // CHECK_NE(sandbox, nullptr);
      // context = sandbox->context();
    }

    CHECK(args[3]->IsNumber());
    line_offset = args[3].As<Integer>();

    CHECK(args[4]->IsNumber());
    column_offset = args[4].As<Integer>();

    if (!args[5]->IsUndefined()) {
      CHECK(args[5]->IsFunction());
      import_module_dynamically = args[5].As<Function>();
    }
    if (!args[6]->IsUndefined()) {
      CHECK(args[6]->IsFunction());
      initialize_import_meta = args[6].As<Function>();
    }
  } else {
    // new ModuleWrap(source, url)
    context = that->CreationContext();
    line_offset = Integer::New(isolate, 0);
    column_offset = Integer::New(isolate, 0);
  }

  TryCatch try_catch(isolate);
  Local<Module> module;
  Local<PrimitiveArray> host_defined_options = PrimitiveArray::New(isolate, 2);

  // compile
  {
    ScriptOrigin origin(url,
                        line_offset,                          // line offset
                        column_offset,                        // column offset
                        False(isolate),                       // is cross origin
                        Local<Integer>(),                     // script id
                        Local<Value>(),                       // source map URL
                        False(isolate),                       // is opaque (?)
                        False(isolate),                       // is WASM
                        True(isolate),                        // is ES6 module
                        host_defined_options);
    Context::Scope context_scope(context);
    ScriptCompiler::Source source(source_text, origin);
    if (!ScriptCompiler::CompileModule(isolate, &source).ToLocal(&module)) {
      CHECK(try_catch.HasCaught());
      CHECK(!try_catch.Message().IsEmpty());
      CHECK(!try_catch.Exception().IsEmpty());
      try_catch.ReThrow();
      return;
    }
  }

  if (!that->Set(context, IVAN_STRING(isolate, "url"), url).FromMaybe(false))
    return;

  ModuleWrap* obj = new ModuleWrap(isolate, that, module, url);
  obj->context_.Reset(isolate, context);

  Local<String> initialize_import_meta_string =
      IVAN_STRING(isolate, "initializeImportMeta");
  Local<String> import_module_dynamically_string =
      IVAN_STRING(isolate, "importModuleDynamically");

  if (!initialize_import_meta.IsEmpty()) {
    if (!that->Set(context, initialize_import_meta_string,
          initialize_import_meta).FromMaybe(false))
      return;
  } else if (!that->Set(context, initialize_import_meta_string,
        Undefined(isolate)).FromMaybe(false)) {
    return;
  }

  if (!import_module_dynamically.IsEmpty()) {
    if (!that->Set(context, import_module_dynamically_string,
          import_module_dynamically).FromMaybe(false))
      return;
  } else if (!that->Set(context, import_module_dynamically_string,
        Undefined(isolate)).FromMaybe(false)) {
    return;
  }


  host_defined_options->Set(0,
      Integer::New(isolate, ModuleWrap::SourceType::kModule));
  host_defined_options->Set(1, Integer::New(isolate, obj->id));

  auto data = GetModuleData(context);

  data->id_to_module_wrap_map[obj->id] = obj;
  data->module_to_module_wrap_map.emplace(module->GetIdentityHash(), obj);

  Wrap(that, obj);

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

  Local<Context> mod_context = obj->context_.Get(isolate);
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
        resolver_arg->Call(mod_context, that, 1, argv);
    if (maybe_resolve_return_value.IsEmpty()) {
      return;
    }
    Local<Value> resolve_return_value =
        maybe_resolve_return_value.ToLocalChecked();
    if (!resolve_return_value->IsPromise()) {
      IVAN_THROW_EXCEPTION(isolate, "linking error, expected resolver to return a promise");
    }
    Local<Promise> resolve_promise = resolve_return_value.As<Promise>();
    obj->resolve_cache_[specifier_std].Reset(isolate, resolve_promise);

    promises->Set(mod_context, i, resolve_promise).FromJust();
  }

  args.GetReturnValue().Set(promises);
}

void ModuleWrap::Instantiate(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  TryCatch try_catch(isolate);
  Maybe<bool> ok =
      module->InstantiateModule(context, ModuleWrap::ResolveCallback);

  // clear resolve cache on instantiate
  obj->resolve_cache_.clear();

  if (!ok.FromMaybe(false)) {
    CHECK(try_catch.HasCaught());
    CHECK(!try_catch.Message().IsEmpty());
    CHECK(!try_catch.Exception().IsEmpty());
    try_catch.ReThrow();
    return;
  }
}

void ModuleWrap::Evaluate(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());
  Local<Context> context = obj->context_.Get(isolate);
  Local<Module> module = obj->module_.Get(isolate);

  // Environment::ShouldNotAbortOnUncaughtScope no_abort_scope(env);

  TryCatch try_catch(isolate);

  // module.evaluate(timeout, breakOnSigint)
  CHECK_EQ(args.Length(), 2);

  CHECK(args[0]->IsNumber());
  int64_t timeout = args[0]->IntegerValue(context).FromJust();

  CHECK(args[1]->IsBoolean());
  bool break_on_sigint = args[1]->IsTrue();

  bool timed_out = false;
  bool received_signal = false;
  MaybeLocal<Value> result;
  if (break_on_sigint && timeout != -1) {
    // Watchdog wd(isolate, timeout, &timed_out);
    // SigintWatchdog swd(isolate, &received_signal);
    result = module->Evaluate(context);
  } else if (break_on_sigint) {
    // SigintWatchdog swd(isolate, &received_signal);
    result = module->Evaluate(context);
  } else if (timeout != -1) {
    // Watchdog wd(isolate, timeout, &timed_out);
    result = module->Evaluate(context);
  } else {
    result = module->Evaluate(context);
  }

  if (timed_out || received_signal) {
    // It is possible that execution was terminated by another timeout in
    // which this timeout is nested, so check whether one of the watchdogs
    // from this invocation is responsible for termination.
    if (timed_out) {
      IVAN_THROW_EXCEPTION(isolate, "Script execution timed out.");
    } else if (received_signal) {
      IVAN_THROW_EXCEPTION(isolate, "Script execution interrupted.");
    }
    isolate->CancelTerminateExecution();
  }

  if (try_catch.HasCaught()) {
    try_catch.ReThrow();
    return;
  }

  args.GetReturnValue().Set(result.ToLocalChecked());
}

void ModuleWrap::Namespace(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  ModuleWrap* obj;
  ASSIGN_OR_RETURN_UNWRAP(&obj, args.This());

  Local<Module> module = obj->module_.Get(isolate);

  switch (module->GetStatus()) {
    default:
      return IVAN_THROW_EXCEPTION(isolate,
          "cannot get namespace, Module has not been instantiated");
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

  ModuleWrap* dependent = ModuleWrap::GetFromModule(context, referrer);
  if (dependent == nullptr) {
    IVAN_THROW_EXCEPTION(isolate, "linking error, unknown module");
    return MaybeLocal<Module>();
  }

  String::Utf8Value specifier_utf8(isolate, specifier);
  std::string specifier_std(*specifier_utf8, specifier_utf8.length());

  if (dependent->resolve_cache_.count(specifier_std) != 1) {
    IVAN_THROW_EXCEPTION(isolate, "linking error, not in local cache");
    return MaybeLocal<Module>();
  }

  Local<Promise> resolve_promise =
      dependent->resolve_cache_[specifier_std].Get(isolate);

  if (resolve_promise->State() != Promise::kFulfilled) {
    IVAN_THROW_EXCEPTION(isolate,
        "linking error, dependency promises must be resolved on instantiate");
    return MaybeLocal<Module>();
  }

  Local<Object> module_object = resolve_promise->Result().As<Object>();
  if (module_object.IsEmpty() || !module_object->IsObject()) {
    IVAN_THROW_EXCEPTION(isolate,
        "linking error, expected a valid module object from resolver");
    return MaybeLocal<Module>();
  }

  ModuleWrap* module;
  ASSIGN_OR_RETURN_UNWRAP(&module, module_object, MaybeLocal<Module>());
  return module->module_.Get(isolate);
}


static MaybeLocal<Promise> ImportModuleDynamically(
    Local<Context> context,
    Local<v8::ScriptOrModule> referrer,
    Local<String> specifier) {
  Isolate* iso = context->GetIsolate();
  v8::EscapableHandleScope handle_scope(iso);

  // TODO(devsnek): find place to keep dynamic import callback
  return MaybeLocal<Promise>();
  Local<Function> import_callback;

  Local<Value> import_args[] = {
    referrer->GetResourceName(),
    Local<Value>(specifier),
    Undefined(iso),
  };

  Local<PrimitiveArray> host_defined_options =
    referrer->GetHostDefinedOptions();

  if (host_defined_options->Length() == 2) {
    int type = host_defined_options->Get(0).As<Integer>()->Value();
    if (type == ModuleWrap::SourceType::kScript) {
      // int id = host_defined_options->Get(1).As<Integer>()->Value();
      // contextify::ContextifyScript* wrap =
      //     contextify::ContextifyScript::GetFromID(context, id);
      // if (wrap != nullptr)
      //   import_args[2] = wrap->object();
    } else if (type == ModuleWrap::SourceType::kModule) {
      int id = host_defined_options->Get(1).As<Integer>()->Value();
      ModuleWrap* wrap = ModuleWrap::GetFromID(context, id);
      if (wrap != nullptr)
        import_args[2] = wrap->object();
    }
  }

  MaybeLocal<Value> maybe_result = import_callback->Call(context,
                                                         v8::Undefined(iso),
                                                         3,
                                                         import_args);

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
  SetImportModuleDynamicallyCallback(iso->GetCurrentContext(), import_callback);
  iso->SetHostImportModuleDynamicallyCallback(ImportModuleDynamically);
}

void ModuleWrap::HostInitializeImportMetaObjectCallback(
    Local<Context> context, Local<Module> module, Local<Object> meta) {
  Isolate* isolate = context->GetIsolate();
  ModuleWrap* module_wrap = ModuleWrap::GetFromModule(context, module);

  if (module_wrap == nullptr)
    return;

  Local<Object> wrap = module_wrap->object();
  Local<Function> callback = GetInitializeImportMetaObjectCallback(context);
  Local<Value> args[] = { wrap, meta };
  TryCatch try_catch(isolate);
  USE(callback->Call(context, Undefined(isolate), arraysize(args), args));
  if (try_catch.HasCaught())
    try_catch.ReThrow();
}

void ModuleWrap::SetInitializeImportMetaObjectCallback(
    const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  CHECK_EQ(args.Length(), 1);
  CHECK(args[0]->IsFunction());

  Local<Function> import_meta_callback = args[0].As<Function>();
  SetInitializeImportMetaObjectCallback(isolate->GetCurrentContext(), import_meta_callback);
  isolate->SetHostInitializeImportMetaObjectCallback(
      HostInitializeImportMetaObjectCallback);
}

void ModuleWrap::Initialize(Isolate* isolate, Local<Object> target) {
  Local<Context> context = isolate->GetCurrentContext();

  Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate);
  tpl->SetClassName(IVAN_STRING(isolate, "ModuleWrap"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  IVAN_SET_PROTO_METHOD(isolate, tpl, "link", Link);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "instantiate", Instantiate);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "evaluate", Evaluate);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "namespace", Namespace);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "getStatus", GetStatus);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "getError", GetError);
  IVAN_SET_PROTO_METHOD(isolate, tpl, "getStaticDependencySpecifiers",
                      GetStaticDependencySpecifiers);

  target->Set(IVAN_STRING(isolate, "ModuleWrap"), tpl->GetFunction());
  IVAN_SET_METHOD(isolate, target,
                  "setImportModuleDynamicallyCallback",
                  ModuleWrap::SetImportModuleDynamicallyCallback);
  IVAN_SET_METHOD(isolate, target,
                  "setInitializeImportMetaObjectCallback",
                  ModuleWrap::SetInitializeImportMetaObjectCallback);

#define V(name)                                                                \
    target->Set(context,                                                       \
      IVAN_STRING(isolate, #name),                                             \
      Integer::New(isolate, Module::Status::name))                             \
        .FromJust()
    V(kUninstantiated);
    V(kInstantiating);
    V(kInstantiated);
    V(kEvaluating);
    V(kEvaluated);
    V(kErrored);
#undef V
}

}  // namespace loader
}  // namespace ivan

IVAN_REGISTER_INTERNAL(module_wrap, ivan::loader::ModuleWrap::Initialize);
